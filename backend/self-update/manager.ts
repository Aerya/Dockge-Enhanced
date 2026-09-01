import { execFile } from "child_process";
import { promisify } from "util";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { BackupManager } from "../watchers/backup-manager";
import { ImageWatcher } from "../watchers/image-watcher";
import { TrivyScanner } from "../watchers/trivy-scanner";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";
import { Settings } from "../settings";
import { getNotificationLang } from "../notification/notification-lang";
import { SelfUpdateOperation, SelfUpdatePlan, SelfUpdateProgress, SelfUpdateSettings } from "./types";
import { DEFAULT_SELF_UPDATE_SETTINGS, normalizeSelfUpdateSettings, selfUpdateMayRun } from "./settings";
import { isAllowedTargetImage, isPathInside, isSafeComposeName, isSelfUpdateActive, normalizeSelfRepository } from "./policy";
import { atomicWriteFile, atomicWriteJson } from "./state-file";
import packageJSON from "../../package.json";

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
            this.operation = { ...idle(), ...JSON.parse(await fs.readFile(STATUS_PATH, "utf8")) } as SelfUpdateOperation;
        } catch {
            this.operation = idle();
        }
        await this.processTerminalNotification();
    }

    getSettings(): SelfUpdateSettings { return JSON.parse(JSON.stringify(this.settings)); }
    getOperation(): SelfUpdateOperation { return { ...this.operation }; }
    getProgress(): SelfUpdateProgress | null { return this.progress ? { ...this.progress } : null; }

    async refreshOperation(): Promise<SelfUpdateOperation> {
        try {
            const diskOperation = { ...idle(), ...JSON.parse(await fs.readFile(STATUS_PATH, "utf8")) } as SelfUpdateOperation;
            this.operation = diskOperation;
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

    async requestSidecarUpdate(targetImage: string, automatic = false): Promise<SelfUpdateOperation> {
        const resumingScheduled = automatic && this.operation.state === "scheduled";
        if (this.requestInFlight || (isSelfUpdateActive(this.operation.state) && !resumingScheduled)) throw new Error("A self-update is already running");
        this.requestInFlight = true;
        try {
        if (automatic && !this.canAutoUpdate()) return this.getOperation();
        if (this.settings.mode !== "sidecar" && automatic) return this.getOperation();
        if (automatic) {
            const reason = this.getBusyReason();
            if (reason) {
                const key = `${targetImage}:${reason}`;
                this.operation = { id: "", state: "scheduled", message: `Automatic self-update deferred: ${reason}`, startedAt: null, finishedAt: null, targetImage, rollbackAttempted: false };
                await this.saveOperation();
                if (key !== this.lastDeferralKey) {
                    this.lastDeferralKey = key;
                    await this.notify("⏳ Dockge-Enhanced update deferred", `Automatic self-update was deferred because ${reason}. It will be retried by the existing update watcher.`, "warning");
                }
                return this.getOperation();
            }
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
        const plan = await this.buildPlan(inspected, safePlanId(), targetImage, previousImage, repository);
        const recoveryPath = path.join(RECOVERY_DIR, plan.recoveryFile);
        await atomicWriteJson(recoveryPath, this.buildRecoverySnapshot(inspected, plan));

        this.operation = { id: plan.id, state: "backing-up", message: "Mandatory backup in progress", startedAt: new Date().toISOString(), finishedAt: null, targetImage, rollbackAttempted: false };
        this.progress = null;
        await this.saveOperation();
        let backup;
        try {
            backup = await BackupManager.getInstance().runBackup({
                tag: "self-update",
                trigger: "manual",
                onProgress: (progress) => { this.progress = progress; },
                additionalPaths: [ recoveryPath ],
            });
        } catch (error) {
            this.operation = { ...this.operation, state: "failed", message: `Backup failed: ${error instanceof Error ? error.message : String(error)}`, finishedAt: new Date().toISOString() };
            await this.saveOperation();
            return this.getOperation();
        }
        if (!backup.success) {
            this.operation = { ...this.operation, state: "failed", message: `Backup failed: ${backup.error ?? "unknown error"}`, finishedAt: new Date().toISOString() };
            await this.saveOperation();
            return this.getOperation();
        }

        this.operation = { ...this.operation, state: "verifying-backup", message: "Restic repository verification in progress" };
        this.progress = null;
        await this.saveOperation();
        let verification;
        try {
            verification = await BackupManager.getInstance().runCheck(undefined, (progress) => { this.progress = progress; });
        } catch (error) {
            this.operation = {
                ...this.operation,
                state: "failed",
                message: `Backup verification failed: ${error instanceof Error ? error.message : String(error)}`,
                finishedAt: new Date().toISOString(),
            };
            await this.saveOperation();
            return this.getOperation();
        }
        const failedVerification = verification.find((result) => !result.ok);
        if (failedVerification) {
            this.operation = {
                ...this.operation,
                state: "failed",
                message: `Backup verification failed for ${failedVerification.label}: ${failedVerification.output}`,
                finishedAt: new Date().toISOString(),
            };
            await this.saveOperation();
            return this.getOperation();
        }
        this.progress = null;

        const stateMount = (inspected.Mounts ?? []).find((mount) => mount.Destination === DATA_DIR);
        if (!stateMount?.Source) throw new Error(`The ${DATA_DIR} volume is required for self-update state`);
        const secret = await this.getOrCreateSecret();
        const payload = { plan, signature: signPlan(plan, secret) };
        await this.cleanupArtifacts(plan.id);
        await atomicWriteJson(path.join(STATE_DIR, `${plan.id}.json`), payload);

        const stateSource = stateMount.Type === "volume" ? (stateMount.Name ?? stateMount.Source) : stateMount.Source;
        const dockerSocket = process.env.DOCKGE_DOCKER_SOCKET ?? "/var/run/docker.sock";
        const socketGroup = (await fs.stat(dockerSocket)).gid;
        const sidecarImage = process.env.DOCKGE_SELF_UPDATE_SIDECAR_IMAGE?.trim() || `ghcr.io/${plan.allowedRepository}-updater:${packageJSON.version}`;
        const args = [
            "run", "-d", "--rm",
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
        await docker(args);
        this.operation = { ...this.operation, state: "updating", message: "Updater sidecar started" };
        await this.saveOperation();
        return this.getOperation();
        } finally {
            this.requestInFlight = false;
        }
    }

    private getBusyReason(): string | null {
        if (ImageWatcher.getInstance().isBusy()) return "an image update or image check is in progress";
        if (BackupManager.getInstance().isBackupRunActive()) return "a Restic backup or backup verification is in progress";
        if (TrivyScanner.getInstance().getStatus().running) return "an image security scan is in progress";
        return null;
    }

    private async notify(title: string, body: string, type: "warning" | "success" | "failure"): Promise<boolean> {
        try {
            const watcher = ImageWatcher.getInstance().settings;
            const en = (await getNotificationLang()) === "en";
            const titleFr: Record<string, string> = {
                "⏳ Dockge-Enhanced update deferred": "⏳ Mise à jour Dockge-Enhanced reportée",
                "✅ Dockge-Enhanced self-update succeeded": "✅ Mise à jour Dockge-Enhanced réussie",
                "❌ Dockge-Enhanced self-update failed": "❌ Échec de la mise à jour Dockge-Enhanced",
                "↩️ Dockge-Enhanced rollback succeeded": "↩️ Restauration Dockge-Enhanced réussie",
                "🚨 Dockge-Enhanced rollback failed": "🚨 Échec de la restauration Dockge-Enhanced",
            };
            const bodyFr: Record<string, string> = {
                "Dockge-Enhanced updated and remained ready": "Dockge-Enhanced a été mis à jour et est resté opérationnel.",
                "Updater sidecar stopped unexpectedly before reporting its status": "Le sidecar de mise à jour s’est arrêté de façon inattendue avant de pouvoir transmettre son état.",
            };
            const localizedTitle = en ? title : (titleFr[title] ?? title);
            const localizedBody = en ? body : (bodyFr[body] ?? body);
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

    private async buildPlan(inspected: DockerInspect, id: string, targetImage: string, previousImage: string, repository: string): Promise<SelfUpdatePlan> {
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

    private async processTerminalNotification(): Promise<void> {
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
            this.operation = { ...this.operation, notificationPending: false, notificationSentAt: new Date().toISOString() };
            await this.saveOperation();
        }
    }

    wasSuccessfulTargetNotified(digest: string): boolean {
        return this.operation.state === "succeeded" && !!this.operation.notificationSentAt && this.operation.targetImage.endsWith(`@${digest}`);
    }
}
