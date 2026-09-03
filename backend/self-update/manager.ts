import { execFile } from "child_process";
import { promisify } from "util";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { BackupManager } from "../watchers/backup-manager";
import { ImageWatcher } from "../watchers/image-watcher";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";
import { Settings } from "../settings";
import { getNotificationLang, notificationText, type NotificationLang } from "../notification/notification-lang";
import { SelfUpdateBlockerCode, SelfUpdateOperation, SelfUpdatePlan, SelfUpdateProgress, SelfUpdateSettings } from "./types";
import { DEFAULT_SELF_UPDATE_SETTINGS, normalizeSelfUpdateSettings, selfUpdateMayRun } from "./settings";
import { isAllowedTargetImage, isPathInside, isSafeComposeName, isSelfUpdateActive, normalizeSelfRepository } from "./policy";
import { atomicWriteFile, atomicWriteJson } from "./state-file";
import { getSelfUpdateBlocker } from "./operation-guard";
import { BLOCKER_MESSAGES } from "./operation-guard-policy";
import { classifySelfUpdateFailure } from "./failure-detail";
import packageJSON from "../../package.json";
import { log } from "../log";

const execFileAsync = promisify(execFile);
const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const STATE_DIR = path.join(DATA_DIR, "self-update");
const SETTINGS_PATH = path.join(STATE_DIR, "settings.json");
const STATUS_PATH = path.join(STATE_DIR, "status.json");
const SECRET_PATH = path.join(STATE_DIR, "plan.key");
const RECOVERY_DIR = path.join(STATE_DIR, "recovery");

interface DockerMount { Type?: string; Source?: string; Name?: string; Destination?: string; }
interface DockerInspect {
    Id?: string;
    Image?: string;
    Name?: string;
    Config?: Record<string, unknown> & { Image?: string; Labels?: Record<string, string>; };
    HostConfig?: Record<string, unknown>;
    NetworkSettings?: { Networks?: Record<string, unknown> };
    Mounts?: DockerMount[];
}

const idle = (): SelfUpdateOperation => ({
    id: "",
    state: "idle",
    message: "",
    startedAt: null,
    finishedAt: null,
    targetImage: "",
    rollbackAttempted: false,
});

function safePlanId(): string {
    return crypto.randomBytes(16).toString("hex");
}

function signPlan(plan: SelfUpdatePlan, secret: Buffer): string {
    return crypto.createHmac("sha256", secret).update(JSON.stringify(plan)).digest("hex");
}

async function docker(args: string[], timeout = 120_000): Promise<string> {
    const { stdout } = await execFileAsync("docker", args, { timeout, maxBuffer: 2 * 1024 * 1024 });
    return stdout;
}

export class SelfUpdateManager {
    private static instance: SelfUpdateManager;
    private settings: SelfUpdateSettings = normalizeSelfUpdateSettings(DEFAULT_SELF_UPDATE_SETTINGS);
    private operation: SelfUpdateOperation = idle();
    private progress: SelfUpdateProgress | null = null;
    private lastDeferralKey = "";
    private requestInFlight = false;
    private terminalStatusWatchTimer: ReturnType<typeof setInterval> | null = null;
    private terminalStatusWatchInFlight = false;
    private terminalStatusWatchDeadline = 0;
    private terminalNotificationInFlight = false;

    static getInstance(): SelfUpdateManager {
        if (!SelfUpdateManager.instance) SelfUpdateManager.instance = new SelfUpdateManager();
        return SelfUpdateManager.instance;
    }

    async load(): Promise<void> {
        try {
            this.settings = normalizeSelfUpdateSettings(JSON.parse(await fs.readFile(SETTINGS_PATH, "utf8")));
        } catch {
            this.settings = normalizeSelfUpdateSettings(DEFAULT_SELF_UPDATE_SETTINGS);
        }
        try {
            this.operation = this.normalizeDeferredOperation(
                { ...idle(), ...JSON.parse(await fs.readFile(STATUS_PATH, "utf8")) } as SelfUpdateOperation,
            );
        } catch {
            this.operation = idle();
        }
        await this.processTerminalNotification();
        this.startTerminalStatusWatch();
    }

    getSettings(): SelfUpdateSettings { return JSON.parse(JSON.stringify(this.settings)); }
    getOperation(): SelfUpdateOperation { return { ...this.operation }; }
    getProgress(): SelfUpdateProgress | null { return this.progress ? { ...this.progress } : null; }

    async refreshOperation(): Promise<SelfUpdateOperation> {
        try {
            const diskOperation = { ...idle(), ...JSON.parse(await fs.readFile(STATUS_PATH, "utf8")) } as SelfUpdateOperation;
            this.operation = this.normalizeDeferredOperation(diskOperation);
        } catch {
            // Keep the in-memory state if the sidecar has not written a status yet.
        }

        // A detached sidecar can disappear before it has a chance to persist an
        // error (bad permissions, runtime crash, etc.). Do not leave the UI stuck
        // forever on "Updater sidecar started" in that case.
        if (
            this.operation.state === "updating"
            && this.operation.message === "Updater sidecar started"
            && this.operation.id
            && this.operation.startedAt
            && Date.now() - Date.parse(this.operation.startedAt) > 15_000
        ) {
            try {
                await docker([ "container", "inspect", `dockge-enhanced-updater-${this.operation.id}`, "--format", "{{.State.Running}}" ], 10_000);
            } catch {
                this.operation = {
                    ...this.operation,
                    state: "failed",
                    message: "Updater sidecar stopped unexpectedly before reporting its status",
                    finishedAt: new Date().toISOString(),
                    notificationPending: true,
                    notificationSentAt: null,
                };
                await this.saveOperation();
            }
        }

        await this.processTerminalNotification();
        return this.getOperation();
    }

    async saveSettings(value: unknown): Promise<SelfUpdateSettings> {
        this.settings = normalizeSelfUpdateSettings(value);
        await atomicWriteJson(SETTINGS_PATH, this.settings);
        return this.getSettings();
    }

    canAutoUpdate(now = new Date()): boolean { return selfUpdateMayRun(this.settings, now); }

    isAutomaticMode(): boolean { return this.settings.mode === "sidecar"; }

    async requestSidecarUpdate(targetImage: string, automatic = false, targetRevision?: string): Promise<SelfUpdateOperation> {
        const resumingScheduled = automatic && this.operation.state === "scheduled";
        if (this.requestInFlight || (isSelfUpdateActive(this.operation.state) && !resumingScheduled)) throw new Error("A self-update is already running");
        this.requestInFlight = true;
        try {
        if (automatic && !this.canAutoUpdate()) return this.getOperation();
        if (this.settings.mode !== "sidecar" && automatic) return this.getOperation();
        if (automatic) {
            const blocker = await getSelfUpdateBlocker();
            if (blocker) {
                const key = `${targetImage}:${blocker.code}`;
                this.operation = {
                    id: "",
                    state: "scheduled",
                    message: `Automatic self-update deferred: ${blocker.message}`,
                    startedAt: null,
                    finishedAt: null,
                    targetImage,
                    rollbackAttempted: false,
                    deferredBy: blocker.code,
                };
                await this.saveOperation();
                if (key !== this.lastDeferralKey) {
                    this.lastDeferralKey = key;
                    await this.notifySelfUpdateDeferred(blocker.code);
                }
                return this.getOperation();
            }
            this.lastDeferralKey = "";
        }
        const containerId = process.env.HOSTNAME?.trim();
        if (!containerId) throw new Error("Current Docker container identifier is unavailable");
        const inspected = JSON.parse(await docker([ "container", "inspect", containerId, "--format", "{{json .}}" ])) as DockerInspect;
        const containerName = (inspected.Name ?? "").replace(/^\//, "");
        const previousImage = inspected.Config?.Image ?? "";
        if (!containerName || !previousImage) throw new Error("Current container metadata is incomplete");
        const repository = this.getAllowedRepository(previousImage);
        const testImages = (process.env.DOCKGE_SELF_UPDATE_TEST_IMAGE ?? "").split(",").map(value => value.trim()).filter(Boolean);
        if (!isAllowedTargetImage(targetImage, repository, testImages)) throw new Error("The requested self-update image is not allowed");
        if (!inspected.Image || !/^sha256:[a-f0-9]{64}$/i.test(inspected.Image)) throw new Error("Current immutable Docker image identifier is unavailable");
        const plan = await this.buildPlan(inspected, safePlanId(), targetImage, previousImage, repository, targetRevision);
        const recoveryPath = path.join(RECOVERY_DIR, plan.recoveryFile);
        const startedMs = Date.now();
        log.info(
            "self-update",
            `Opération créée — id=${plan.id} automatic=${automatic} container=${containerName} current=${inspected.Image} target=${targetImage} repository=${repository}`,
        );
        await atomicWriteJson(recoveryPath, this.buildRecoverySnapshot(inspected, plan));

        const secret = await this.getOrCreateSecret();
        const selfUpdateRetentionTag = `self-update-instance-${crypto.createHash("sha256").update(secret).digest("hex").slice(0, 16)}`;

        this.operation = { id: plan.id, state: "backing-up", message: "Mandatory backup in progress", startedAt: new Date().toISOString(), finishedAt: null, targetImage, rollbackAttempted: false };
        this.progress = null;
        await this.saveOperation();
        log.info("self-update", `Étape 1/4 — backup Restic minimal démarré — id=${plan.id} data=${DATA_DIR} recovery=${recoveryPath}`);
        let backup;
        try {
            backup = await BackupManager.getInstance().runBackup({
                tag: "self-update",
                trigger: "manual",
                onProgress: (progress) => { this.progress = progress; },
                additionalPaths: [ DATA_DIR, recoveryPath ],
                selfUpdateOnly: true,
                suppressNotification: true,
                additionalTags: [ selfUpdateRetentionTag ],
            });
        } catch (error) {
            this.operation = {
                ...this.operation,
                state: "failed",
                message: `Backup failed: ${error instanceof Error ? error.message : String(error)}`,
                finishedAt: new Date().toISOString(),
                notificationPending: true,
                notificationSentAt: null,
            };
            await this.saveOperation();
            return this.getOperation();
        }
        if (!backup.success) {
            log.error("self-update", `Backup Restic échoué — id=${plan.id} error=${backup.error ?? "unknown error"}`);
            this.operation = {
                ...this.operation,
                state: "failed",
                message: `Backup failed: ${backup.error ?? "unknown error"}`,
                finishedAt: new Date().toISOString(),
                notificationPending: true,
                notificationSentAt: null,
            };
            await this.saveOperation();
            return this.getOperation();
        }

        log.info("self-update", `Backup Restic terminé — id=${plan.id} duration=${Date.now() - startedMs}ms`);
        this.operation = { ...this.operation, state: "verifying-backup", message: "Self-update snapshot verification in progress" };
        log.info("self-update", `Étape 2/4 — validation ciblée du snapshot Restic — id=${plan.id}`);
        this.progress = null;
        await this.saveOperation();
        try {
            const verification = await BackupManager.getInstance().verifyFreshBackup(backup);
            const failed = verification.find((result) => !result.ok);
            if (failed) {
                this.operation = {
                    ...this.operation,
                    state: "failed",
                    message: `Backup verification failed for ${failed.label}: ${failed.output}`,
                    finishedAt: new Date().toISOString(),
                    notificationPending: true,
                    notificationSentAt: null,
                };
                await this.saveOperation();
                return this.getOperation();
            }
        } catch (error) {
            this.operation = {
                ...this.operation,
                state: "failed",
                message: `Backup verification failed: ${error instanceof Error ? error.message : String(error)}`,
                finishedAt: new Date().toISOString(),
                notificationPending: true,
                notificationSentAt: null,
            };
            await this.saveOperation();
            return this.getOperation();
        }
        this.progress = null;

        const retentionResults = await BackupManager.getInstance().pruneSelfUpdateSnapshots(
            backup,
            selfUpdateRetentionTag,
            2,
        );
        for (const retention of retentionResults) {
            if (retention.error) {
                log.warn(
                    "self-update",
                    `Nettoyage des anciens snapshots reporté — label=${retention.label} error=${retention.error}`,
                );
            }
        }

        const stateMount = (inspected.Mounts ?? []).find((mount) => mount.Destination === DATA_DIR);
        if (!stateMount?.Source) throw new Error(`The ${DATA_DIR} volume is required for self-update state`);
        plan.issuedAt = new Date().toISOString();
        plan.expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
        const payload = { plan, signature: signPlan(plan, secret) };
        await this.cleanupArtifacts(plan.id);
        await atomicWriteJson(path.join(STATE_DIR, `${plan.id}.json`), payload);

        const stateSource = stateMount.Type === "volume" ? (stateMount.Name ?? stateMount.Source) : stateMount.Source;
        const dockerSocket = process.env.DOCKGE_DOCKER_SOCKET ?? "/var/run/docker.sock";
        const socketGroup = (await fs.stat(dockerSocket)).gid;
        const sidecarImage = process.env.DOCKGE_SELF_UPDATE_SIDECAR_IMAGE?.trim()
            || `ghcr.io/${plan.allowedRepository}-updater:latest`;

        log.info("self-update", `Téléchargement du sidecar — id=${plan.id} image=${sidecarImage}`);
        try {
            await docker([ "image", "pull", sidecarImage ], 10 * 60_000);
        } catch (error) {
            this.operation = {
                ...this.operation,
                state: "failed",
                message: `Updater sidecar pull failed: ${error instanceof Error ? error.message : String(error)}`,
                finishedAt: new Date().toISOString(),
                notificationPending: true,
                notificationSentAt: null,
            };
            await this.saveOperation();
            return this.getOperation();
        }

        const args = [
            "run", "--pull=always", "-d", "--rm",
            "--name", `dockge-enhanced-updater-${plan.id}`,
            "--label", "io.dockge-enhanced.self-update=true",
            // State files are intentionally 0600 in a 0700 directory. The updater
            // therefore needs root inside its own container to read/write them.
            // Drop every Linux capability and forbid privilege escalation: Docker
            // access remains limited to the explicitly mounted socket.
            "--user", "0:0",
            "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges",
            "--read-only",
            "--group-add", String(socketGroup),
            "-v", `${dockerSocket}:/var/run/docker.sock`,
            "-v", `${stateSource}:/state`,
            "-e", `SELF_UPDATE_PLAN=/state/self-update/${plan.id}.json`,
            "-e", `SELF_UPDATE_ALLOW_TEST_IMAGES=${process.env.DOCKGE_SELF_UPDATE_TEST_IMAGE ?? ""}`,
            "-e", `SELF_UPDATE_ALLOWED_REPOSITORY=${plan.allowedRepository}`,
            "-e", `SELF_UPDATE_TARGET_CONTAINER_ID=${plan.targetContainerId}`,
            "-e", `SELF_UPDATE_TARGET_CONTAINER_NAME=${plan.targetContainerName}`,
            sidecarImage,
        ];
        if (plan.compose) {
            args.splice(args.length - 1, 0, "-v", `${plan.compose.workingDir}:${plan.compose.workingDir}:ro`, "-e", `SELF_UPDATE_COMPOSE_DIR=${plan.compose.workingDir}`);
        }
        log.info("self-update", `Étape 3/4 — lancement sidecar — id=${plan.id} image=${sidecarImage}`);
        try {
            await docker(args, 10 * 60_000);
        } catch (error) {
            this.operation = {
                ...this.operation,
                state: "failed",
                message: `Updater sidecar launch failed: ${error instanceof Error ? error.message : String(error)}`,
                finishedAt: new Date().toISOString(),
                notificationPending: true,
                notificationSentAt: null,
            };
            await this.saveOperation();
            return this.getOperation();
        }
        log.info("self-update", `Sidecar lancé — id=${plan.id} container=dockge-enhanced-updater-${plan.id}`);
        this.operation = { ...this.operation, state: "updating", message: "Updater sidecar started" };
        await this.saveOperation();
        return this.getOperation();
        } finally {
            this.requestInFlight = false;
        }
    }

    private inferDeferredBlockerCode(message: string): SelfUpdateBlockerCode | null {
        const normalized = message.toLowerCase();
        const entries = Object.entries(BLOCKER_MESSAGES) as Array<[SelfUpdateBlockerCode, string]>;
        return entries.find(([, blockerMessage]) => normalized.includes(blockerMessage.toLowerCase()))?.[0] ?? null;
    }

    private normalizeDeferredOperation(operation: SelfUpdateOperation): SelfUpdateOperation {
        if (operation.state !== "scheduled" || operation.deferredBy || !operation.message) return operation;
        const deferredBy = this.inferDeferredBlockerCode(operation.message);
        return deferredBy ? { ...operation, deferredBy } : operation;
    }

    private localizedDeferredReason(code: SelfUpdateBlockerCode, lang: NotificationLang): string {
        const reasons: Record<SelfUpdateBlockerCode, [string, string, string, string]> = {
            "image-work": [ "une vérification ou une mise à jour d’image Docker est en cours", "an image update or image check is in progress", "hay una comprobación o actualización de imagen Docker en curso", "Docker 镜像检查或更新正在进行" ],
            "restic-backup": [ "un backup Restic ou sa vérification est en cours", "a Restic backup or backup verification is in progress", "hay una copia Restic o su verificación en curso", "Restic 备份或备份验证正在进行" ],
            "restic-restore": [ "une restauration Restic est en cours", "a Restic restore is in progress", "hay una restauración Restic en curso", "Restic 恢复正在进行" ],
            "stack-transfer": [ "une copie, un déplacement ou un transfert de données de stack est en cours", "a stack copy, move or data transfer is in progress", "hay una copia, traslado o transferencia de datos de stack en curso", "堆栈复制、移动或数据传输正在进行" ],
            "stack-replication": [ "une réplication ou un test de restauration de stack est en cours", "a stack replication or recovery test is in progress", "hay una replicación o una prueba de recuperación de stack en curso", "堆栈复制或恢复测试正在进行" ],
            "trivy-scan": [ "un scan de sécurité Trivy est en cours", "an image security scan is in progress", "hay un análisis de seguridad Trivy en curso", "Trivy 安全扫描正在进行" ],
            "external-stack-integration": [ "une intégration protégée de stack externe est en cours", "a protected external-stack integration is in progress", "hay una integración protegida de stack externa en curso", "受保护的外部堆栈集成正在进行" ],
            "state-check-error": [ "l’état des opérations sensibles n’a pas pu être vérifié de façon sûre", "the state of sensitive operations could not be verified safely", "no se pudo verificar de forma segura el estado de las operaciones sensibles", "无法安全验证敏感操作的状态" ],
        };
        return notificationText(lang, ...reasons[code]);
    }

    private async notifySelfUpdateDeferred(code: SelfUpdateBlockerCode): Promise<boolean> {
        const lang = await getNotificationLang();
        const reason = this.localizedDeferredReason(code, lang);
        return this.notify(
            "⏳ Dockge-Enhanced update deferred",
            notificationText(
                lang,
                `La mise à jour automatique attend car ${reason}. Elle sera retentée automatiquement dès que l’opération sera terminée.`,
                `The automatic self-update is waiting because ${reason}. It will retry automatically as soon as the operation finishes.`,
                `La actualización automática está esperando porque ${reason}. Se reintentará automáticamente cuando termine la operación.`,
                `自动更新正在等待，因为${reason}。操作完成后将自动重试。`,
            ),
            "warning",
        );
    }

    private summarizeFailureForNotification(body: string, lang: NotificationLang): string {
        const kind = classifySelfUpdateFailure(body);
        const messages: Record<ReturnType<typeof classifySelfUpdateFailure>, [string, string, string, string]> = {
            "network-timeout": [
                "Timeout réseau lors du téléchargement de l’image GHCR.",
                "Network timeout while downloading the GHCR image.",
                "Tiempo de espera de red agotado al descargar la imagen GHCR.",
                "下载 GHCR 镜像时发生网络超时。",
            ],
            "registry-auth": [
                "Authentification refusée par le registre GHCR.",
                "Authentication was rejected by the GHCR registry.",
                "El registro GHCR rechazó la autenticación.",
                "GHCR 注册表拒绝了身份验证。",
            ],
            "registry-forbidden": [
                "Accès refusé par le registre GHCR.",
                "Access was denied by the GHCR registry.",
                "El registro GHCR denegó el acceso.",
                "GHCR 注册表拒绝了访问。",
            ],
            "image-not-found": [
                "Image ou digest introuvable sur GHCR.",
                "Image or digest not found on GHCR.",
                "Imagen o digest no encontrado en GHCR.",
                "在 GHCR 上找不到镜像或摘要。",
            ],
            dns: [
                "Résolution DNS impossible pour le registre GHCR.",
                "DNS resolution failed for the GHCR registry.",
                "No se pudo resolver por DNS el registro GHCR.",
                "无法解析 GHCR 注册表的 DNS。",
            ],
            generic: [
                "Échec technique lors de la récupération ou de l’application de l’image GHCR.",
                "Technical failure while fetching or applying the GHCR image.",
                "Fallo técnico al descargar o aplicar la imagen GHCR.",
                "获取或应用 GHCR 镜像时发生技术错误。",
            ],
        };
        return notificationText(lang, ...messages[kind]);
    }

    private async notify(title: string, body: string, type: "warning" | "success" | "failure"): Promise<boolean> {
        try {
            const watcher = ImageWatcher.getInstance().settings;
            const lang = await getNotificationLang();
            const titleTranslations: Record<string, [string, string, string, string]> = {
                "⏳ Dockge-Enhanced update deferred": [
                    "⏳ Mise à jour Dockge-Enhanced reportée",
                    "⏳ Dockge-Enhanced update deferred",
                    "⏳ Actualización de Dockge-Enhanced aplazada",
                    "⏳ Dockge-Enhanced 更新已推迟",
                ],
                "✅ Dockge-Enhanced self-update succeeded": [
                    "✅ Dockge-Enhanced mis à jour",
                    "✅ Dockge-Enhanced updated",
                    "✅ Dockge-Enhanced actualizado",
                    "✅ Dockge-Enhanced 已更新",
                ],
                "❌ Dockge-Enhanced self-update failed": [
                    "❌ Échec de la mise à jour Dockge-Enhanced",
                    "❌ Dockge-Enhanced self-update failed",
                    "❌ Error en la actualización automática de Dockge-Enhanced",
                    "❌ Dockge-Enhanced 自更新失败",
                ],
                "↩️ Dockge-Enhanced rollback succeeded": [
                    "↩️ Restauration Dockge-Enhanced réussie",
                    "↩️ Dockge-Enhanced rollback succeeded",
                    "↩️ Rollback de Dockge-Enhanced correcto",
                    "↩️ Dockge-Enhanced 回滚成功",
                ],
                "🚨 Dockge-Enhanced rollback failed": [
                    "🚨 Échec de la restauration Dockge-Enhanced",
                    "🚨 Dockge-Enhanced rollback failed",
                    "🚨 Error en el rollback de Dockge-Enhanced",
                    "🚨 Dockge-Enhanced 回滚失败",
                ],
            };
            const bodyTranslations: Record<string, [string, string, string, string]> = {
                "Dockge-Enhanced updated and remained ready": [
                    "Dockge-Enhanced a été mis à jour et est resté opérationnel.",
                    "Dockge-Enhanced updated and remained ready",
                    "Dockge-Enhanced se actualizó y permaneció operativo.",
                    "Dockge-Enhanced 已更新并保持正常运行。",
                ],
                "Updater sidecar stopped unexpectedly before reporting its status": [
                    "Le sidecar de mise à jour s’est arrêté de façon inattendue avant de pouvoir transmettre son état.",
                    "Updater sidecar stopped unexpectedly before reporting its status",
                    "El sidecar de actualización se detuvo inesperadamente antes de informar de su estado.",
                    "更新 Sidecar 在报告状态前意外停止。",
                ],
            };
            Object.assign(bodyTranslations, {
                "Mandatory backup in progress": [
                    "Backup obligatoire en cours",
                    "Mandatory backup in progress",
                    "Copia obligatoria en curso",
                    "正在执行强制备份",
                ],
                "Restic repository verification in progress": [
                    "Vérification du dépôt Restic en cours",
                    "Restic repository verification in progress",
                    "Verificación del repositorio Restic en curso",
                    "正在验证 Restic 仓库",
                ],
                "Updater sidecar started": [
                    "Sidecar de mise à jour démarré",
                    "Updater sidecar started",
                    "Sidecar de actualización iniciado",
                    "更新 Sidecar 已启动",
                ],
            });
            const titleSet = titleTranslations[title];
            const bodySet = bodyTranslations[body];
            const localizedTitle = titleSet ? notificationText(lang, ...titleSet) : title;
            let localizedBody = bodySet ? notificationText(lang, ...bodySet) : body;

            const targetDigest = this.operation.targetImage.match(/sha256:([a-f0-9]{64})/i)?.[1] ?? "";
            const shortDigest = targetDigest ? targetDigest.slice(0, 12) : "";
            const targetRepo = this.operation.targetImage.match(/^ghcr\.io\/(.+?)@sha256:/i)?.[1] ?? "aerya/dockge-enhanced";
            const changelogUrl = `https://github.com/${targetRepo}`;

            if (title === "✅ Dockge-Enhanced self-update succeeded") {
                localizedBody = notificationText(
                    lang,
                    [
                        "Mise à jour installée avec succès.",
                        "",
                        "**Backup Restic** · Vérifié",
                        shortDigest ? `**Image** · \`${shortDigest}\`` : "",
                        "**État** · Opérationnel",
                        "",
                        `Voir les changements : ${changelogUrl}`,
                    ].filter(Boolean).join("\n"),
                    [
                        "Update installed successfully.",
                        "",
                        "**Restic backup** · Verified",
                        shortDigest ? `**Image** · \`${shortDigest}\`` : "",
                        "**Status** · Operational",
                        "",
                        `See changes: ${changelogUrl}`,
                    ].filter(Boolean).join("\n"),
                    [
                        "Actualización instalada correctamente.",
                        "",
                        "**Copia Restic** · Verificada",
                        shortDigest ? `**Imagen** · \`${shortDigest}\`` : "",
                        "**Estado** · Operativo",
                        "",
                        `Ver los cambios: ${changelogUrl}`,
                    ].filter(Boolean).join("\n"),
                    [
                        "更新已成功安装。",
                        "",
                        "**Restic 备份** · 已验证",
                        shortDigest ? `**镜像** · \`${shortDigest}\`` : "",
                        "**状态** · 运行正常",
                        "",
                        `查看更改：${changelogUrl}`,
                    ].filter(Boolean).join("\n"),
                );
            } else if (title === "↩️ Dockge-Enhanced rollback succeeded") {
                const failureSummary = this.summarizeFailureForNotification(body, lang);
                localizedBody = notificationText(
                    lang,
                    [
                        "La mise à jour a échoué, mais l’ancienne version a été restaurée automatiquement.",
                        "",
                        "**Backup Restic** · Vérifié",
                        "**Rollback** · Réussi",
                        "**État** · Opérationnel",
                        "",
                        `**Cause** · ${failureSummary}`,
                    ].join("\n"),
                    [
                        "The update failed, but the previous version was restored automatically.",
                        "",
                        "**Restic backup** · Verified",
                        "**Rollback** · Successful",
                        "**Status** · Operational",
                        "",
                        `**Cause** · ${failureSummary}`,
                    ].join("\n"),
                    [
                        "La actualización falló, pero la versión anterior se restauró automáticamente.",
                        "",
                        "**Copia Restic** · Verificada",
                        "**Rollback** · Correcto",
                        "**Estado** · Operativo",
                        "",
                        `**Causa** · ${failureSummary}`,
                    ].join("\n"),
                    [
                        "更新失败，但旧版本已自动恢复。",
                        "",
                        "**Restic 备份** · 已验证",
                        "**回滚** · 成功",
                        "**状态** · 运行正常",
                        "",
                        `**原因** · ${failureSummary}`,
                    ].join("\n"),
                );
            } else if (title === "❌ Dockge-Enhanced self-update failed") {
                const failureSummary = this.summarizeFailureForNotification(body, lang);
                localizedBody = notificationText(
                    lang,
                    `La mise à jour automatique a échoué.\n\n**Cause** · ${failureSummary}`,
                    `The automatic update failed.\n\n**Cause** · ${failureSummary}`,
                    `La actualización automática falló.\n\n**Causa** · ${failureSummary}`,
                    `自动更新失败。\n\n**原因** · ${failureSummary}`,
                );
            }
            const prefixedBodies: Array<[string, [string, string, string, string]]> = [
                ["Backup failed: ", [ "Échec du backup : ", "Backup failed: ", "Error en la copia: ", "备份失败：" ]],
                ["Backup verification failed: ", [ "Échec de la vérification du backup : ", "Backup verification failed: ", "Error en la verificación de la copia: ", "备份验证失败：" ]],
                ["Automatic self-update deferred: ", [ "Mise à jour automatique reportée : ", "Automatic self-update deferred: ", "Actualización automática aplazada: ", "自动更新已推迟：" ]],
            ];
            for (const [prefix, translatedPrefixes] of prefixedBodies) {
                if (body.startsWith(prefix)) {
                    localizedBody = `${notificationText(lang, ...translatedPrefixes)}${body.slice(prefix.length)}`;
                    break;
                }
            }
            const verificationMatch = body.match(/^Backup verification failed for (.+?): (.*)$/s);
            if (verificationMatch) {
                localizedBody = notificationText(
                    lang,
                    `Échec de la vérification du backup pour ${verificationMatch[1]} : ${verificationMatch[2]}`,
                    body,
                    `Error en la verificación de la copia para ${verificationMatch[1]}: ${verificationMatch[2]}`,
                    `${verificationMatch[1]} 的备份验证失败：${verificationMatch[2]}`,
                );
            }
            const deferredMatch = body.match(/^Automatic self-update was deferred because (.+)\. It will be retried by the existing update watcher\.$/s);
            if (deferredMatch) {
                const blockerCode = this.inferDeferredBlockerCode(deferredMatch[1]);
                const reason = blockerCode ? this.localizedDeferredReason(blockerCode, lang) : deferredMatch[1];
                localizedBody = notificationText(
                    lang,
                    `La mise à jour automatique a été reportée car ${reason}. Elle sera retentée par le watcher de mise à jour existant.`,
                    `The automatic self-update was deferred because ${reason}. It will be retried by the existing update watcher.`,
                    `La actualización automática se aplazó porque ${reason}. El watcher de actualizaciones existente volverá a intentarlo.`,
                    `自动更新已推迟，原因：${reason}。现有更新监视器将稍后重试。`,
                );
            }

            const deferredPrefix = "Automatic self-update deferred: ";
            if (body.startsWith(deferredPrefix)) {
                const rawReason = body.slice(deferredPrefix.length);
                const blockerCode = this.inferDeferredBlockerCode(rawReason);
                const reason = blockerCode ? this.localizedDeferredReason(blockerCode, lang) : rawReason;
                localizedBody = notificationText(
                    lang,
                    `Mise à jour automatique reportée : ${reason}`,
                    `Automatic self-update deferred: ${reason}`,
                    `Actualización automática aplazada: ${reason}`,
                    `自动更新已推迟：${reason}`,
                );
            }
            const hostname = (await Settings.get("primaryHostname")) || "";
            const fullTitle = hostname ? `[${hostname}] ${localizedTitle}` : localizedTitle;
            if (watcher.discordWebhooks.length > 0) {
                await new DiscordNotifier(watcher.discordWebhooks).sendEmbed({ title: fullTitle, description: localizedBody, color: type === "failure" ? 0xef4444 : type === "success" ? 0x22c55e : 0xf59e0b, footer: `Dockge Enhanced${hostname ? ` · ${hostname}` : ""}` });
            }
            if (watcher.appriseServerUrl) {
                await new AppriseNotifier(watcher.appriseServerUrl, watcher.appriseUrls).send({ title: fullTitle, body: localizedBody, type });
            }
            return true;
        } catch (error) {
            console.warn("[SelfUpdateManager] Notification failed:", error);
            return false;
        }
    }

    private async buildPlan(inspected: DockerInspect, id: string, targetImage: string, previousImage: string, repository: string, targetRevision?: string): Promise<SelfUpdatePlan> {
        const labels = inspected.Config?.Labels ?? {};
        const workingDir = labels["com.docker.compose.project.working_dir"];
        const configFiles = labels["com.docker.compose.project.config_files"]?.split(",").map((file) => file.trim()).filter(Boolean) ?? [];
        let compose: SelfUpdatePlan["compose"];
        const project = labels["com.docker.compose.project"] ?? "";
        const service = labels["com.docker.compose.service"] ?? "";
        if (workingDir && path.isAbsolute(workingDir) && configFiles.length > 0 && isSafeComposeName(project) && isSafeComposeName(service)) {
            const realWorkingDir = await fs.realpath(workingDir).catch(() => "");
            const validFiles: string[] = [];
            for (const file of configFiles) {
                if (!isPathInside(workingDir, file)) continue;
                const realFile = await fs.realpath(file).catch(() => "");
                if (!realWorkingDir || !realFile || !isPathInside(realWorkingDir, realFile)) continue;
                if (!(await fs.stat(realFile)).isFile()) continue;
                validFiles.push(file);
            }
            if (validFiles.length === configFiles.length) compose = { workingDir, configFiles: validFiles, project, service };
        }
        return {
            version: 1,
            id,
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
            targetContainerId: inspected.Id ?? process.env.HOSTNAME ?? "",
            targetContainerName: (inspected.Name ?? "").replace(/^\//, ""),
            targetImage,
            targetRevision: targetRevision && /^[a-f0-9]{40}$/i.test(targetRevision) ? targetRevision.toLowerCase() : undefined,
            previousImage,
            previousImageId: inspected.Image ?? "",
            allowedRepository: repository,
            recoveryFile: `${id}.json`,
            compose,
        };
    }

    private getAllowedRepository(previousImage: string): string {
        const configured = process.env.DOCKGE_SELF_REPO?.trim();
        if (configured) return normalizeSelfRepository(configured);
        const match = previousImage.match(/^ghcr\.io\/(.+?)(?::[^/@]+|@sha256:[a-f0-9]{64})$/i);
        return normalizeSelfRepository(match?.[1] ?? "aerya/dockge-enhanced");
    }

    private buildRecoverySnapshot(inspected: DockerInspect, plan: SelfUpdatePlan): unknown {
        const config = { ...(inspected.Config ?? {}) };
        delete config.Hostname;
        delete config.Domainname;
        return {
            version: 1, id: plan.id, targetContainerId: plan.targetContainerId,
            targetContainerName: plan.targetContainerName, previousImage: plan.previousImage, previousImageId: plan.previousImageId,
            config, hostConfig: inspected.HostConfig ?? {}, endpointsConfig: inspected.NetworkSettings?.Networks ?? {},
        };
    }

    private async cleanupArtifacts(currentId: string): Promise<void> {
        await fs.mkdir(RECOVERY_DIR, { recursive: true, mode: 0o700 });
        const entries = await fs.readdir(STATE_DIR, { withFileTypes: true });
        const cutoff = Date.now() - 24 * 60 * 60_000;
        for (const entry of entries) {
            if (!entry.isFile() || entry.name.includes(currentId)) continue;
            if (!/^[a-f0-9]{32}\.(json|override\.yaml|json\.claimed)$/.test(entry.name)) continue;
            const file = path.join(STATE_DIR, entry.name);
            const stat = await fs.stat(file);
            if (stat.mtimeMs < cutoff) await fs.unlink(file).catch(() => undefined);
        }
        const recovery = (await fs.readdir(RECOVERY_DIR, { withFileTypes: true }))
            .filter(entry => entry.isFile() && /^[a-f0-9]{32}\.json$/.test(entry.name))
            .map(entry => entry.name);
        const ordered = await Promise.all(recovery.map(async name => ({ name, mtime: (await fs.stat(path.join(RECOVERY_DIR, name))).mtimeMs })));
        ordered.sort((a, b) => b.mtime - a.mtime);
        for (const old of ordered.slice(2)) {
            await fs.unlink(path.join(RECOVERY_DIR, old.name)).catch(() => undefined);
        }
    }

    private async getOrCreateSecret(): Promise<Buffer> {
        await fs.mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
        try { return await fs.readFile(SECRET_PATH); } catch { /* create below */ }
        const secret = crypto.randomBytes(32);
        await atomicWriteFile(SECRET_PATH, secret);
        return secret;
    }

    private async saveOperation(): Promise<void> {
        await atomicWriteJson(STATUS_PATH, this.operation);
    }

    private shouldWatchTerminalStatus(): boolean {
        return this.operation.notificationPending === true
            || [ "updating", "waiting-health", "rolling-back" ].includes(this.operation.state);
    }

    private startTerminalStatusWatch(): void {
        if (this.terminalStatusWatchTimer || !this.shouldWatchTerminalStatus()) return;

        this.terminalStatusWatchDeadline = Date.now() + 15 * 60_000;
        log.info(
            "self-update",
            `Surveillance autonome de l’état terminal démarrée — state=${this.operation.state} id=${this.operation.id || "indisponible"}`,
        );

        const poll = async () => {
            if (this.terminalStatusWatchInFlight) return;
            this.terminalStatusWatchInFlight = true;
            try {
                await this.refreshOperation();

                if (!this.shouldWatchTerminalStatus()) {
                    this.stopTerminalStatusWatch();
                    return;
                }

                if (Date.now() >= this.terminalStatusWatchDeadline) {
                    log.warn(
                        "self-update",
                        `Surveillance autonome arrêtée après 15 min — state=${this.operation.state} id=${this.operation.id || "indisponible"}`,
                    );
                    this.stopTerminalStatusWatch();
                }
            } catch (error) {
                log.warn(
                    "self-update",
                    `Lecture autonome de l’état terminal échouée — ${error instanceof Error ? error.message : String(error)}`,
                );
            } finally {
                this.terminalStatusWatchInFlight = false;
            }
        };

        this.terminalStatusWatchTimer = setInterval(() => { void poll(); }, 2_000);
        this.terminalStatusWatchTimer.unref?.();
        void poll();
    }

    private stopTerminalStatusWatch(): void {
        if (!this.terminalStatusWatchTimer) return;
        clearInterval(this.terminalStatusWatchTimer);
        this.terminalStatusWatchTimer = null;
        this.terminalStatusWatchDeadline = 0;
    }

    private async processTerminalNotification(): Promise<void> {
        if (this.terminalNotificationInFlight) return;
        if (!this.operation.notificationPending || this.operation.notificationSentAt || isSelfUpdateActive(this.operation.state)) return;

        this.terminalNotificationInFlight = true;
        try {
            // Un second chemin (watcher autonome, /self/status, load) peut arriver
            // pendant l'envoi Discord/Apprise. Le verrou est acquis avant tout
            // await pour empêcher deux envois du même résultat terminal.
            if (!this.operation.notificationPending || this.operation.notificationSentAt || isSelfUpdateActive(this.operation.state)) return;

            await ImageWatcher.getInstance().loadSettings();
            const messages: Partial<Record<SelfUpdateOperation["state"], [string, "success" | "failure"]>> = {
                succeeded: [ "✅ Dockge-Enhanced self-update succeeded", "success" ],
                failed: [ "❌ Dockge-Enhanced self-update failed", "failure" ],
                "rolled-back": [ "↩️ Dockge-Enhanced rollback succeeded", "failure" ],
                "rollback-failed": [ "🚨 Dockge-Enhanced rollback failed", "failure" ],
            };
            const notification = messages[this.operation.state];
            if (!notification) return;

            if (await this.notify(notification[0], this.operation.message, notification[1])) {
                this.operation = {
                    ...this.operation,
                    notificationPending: false,
                    notificationSentAt: new Date().toISOString(),
                };
                await this.saveOperation();
            }
        } finally {
            this.terminalNotificationInFlight = false;
        }
    }

    async clearObsoleteFailureState(): Promise<void> {
        if (![ "failed", "rolled-back", "rollback-failed" ].includes(this.operation.state)) return;
        log.info(
            "self-update",
            `Ancien état terminal effacé — state=${this.operation.state} target=${this.operation.targetImage || "indisponible"}`,
        );
        this.operation = idle();
        this.progress = null;
        await this.saveOperation();
    }

    shouldBlockAutomaticRetry(targetImage: string): boolean {
        return (
            [ "failed", "rolled-back", "rollback-failed" ].includes(this.operation.state)
            && this.operation.targetImage === targetImage
        );
    }

    isSuccessfulTarget(digest: string): boolean {
        return this.operation.state === "succeeded" && this.operation.targetImage.endsWith(`@${digest}`);
    }

    isManagedImageTransition(now = Date.now()): boolean {
        if (!this.operation.targetImage) return false;
        if (isSelfUpdateActive(this.operation.state)) return true;
        if (this.operation.state !== "succeeded" || !this.operation.finishedAt) return false;

        const finishedAt = Date.parse(this.operation.finishedAt);
        if (!Number.isFinite(finishedAt)) return false;

        const age = now - finishedAt;
        return age >= 0 && age <= 30 * 60_000;
    }
}
