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
import { SelfUpdateOperation, SelfUpdatePlan, SelfUpdateProgress, SelfUpdateSettings } from "./types";
import { DEFAULT_SELF_UPDATE_SETTINGS, normalizeSelfUpdateSettings, selfUpdateMayRun } from "./settings";

const execFileAsync = promisify(execFile);
const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const STATE_DIR = path.join(DATA_DIR, "self-update");
const SETTINGS_PATH = path.join(STATE_DIR, "settings.json");
const STATUS_PATH = path.join(STATE_DIR, "status.json");
const SECRET_PATH = path.join(STATE_DIR, "plan.key");
const SIDECAR_IMAGE = process.env.DOCKGE_SELF_UPDATE_SIDECAR_IMAGE?.trim() || "ghcr.io/aerya/dockge-enhanced-updater:latest";

interface DockerMount { Type?: string; Source?: string; Name?: string; Destination?: string; }
interface DockerInspect {
    Id?: string;
    Name?: string;
    Config?: { Image?: string; Labels?: Record<string, string>; };
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
    }

    getSettings(): SelfUpdateSettings { return JSON.parse(JSON.stringify(this.settings)); }
    getOperation(): SelfUpdateOperation { return { ...this.operation }; }
    getProgress(): SelfUpdateProgress | null { return this.progress ? { ...this.progress } : null; }

    async saveSettings(value: unknown): Promise<SelfUpdateSettings> {
        this.settings = normalizeSelfUpdateSettings(value);
        await fs.mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2), { mode: 0o600 });
        return this.getSettings();
    }

    canAutoUpdate(now = new Date()): boolean { return selfUpdateMayRun(this.settings, now); }

    isAutomaticMode(): boolean { return this.settings.mode === "sidecar"; }

    async requestSidecarUpdate(targetImage: string, automatic = false): Promise<SelfUpdateOperation> {
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
        if (this.operation.state === "backing-up" || this.operation.state === "updating" || this.operation.state === "waiting-health") {
            throw new Error("A self-update is already running");
        }
        if (!/^ghcr\.io\/[a-z0-9._-]+\/dockge-enhanced(?::[a-z0-9._-]+|@sha256:[a-f0-9]{64})$/i.test(targetImage)
            && !process.env.DOCKGE_SELF_UPDATE_TEST_IMAGE?.split(",").includes(targetImage)) {
            throw new Error("The requested self-update image is not allowed");
        }

        const containerId = process.env.HOSTNAME?.trim();
        if (!containerId) throw new Error("Current Docker container identifier is unavailable");
        const inspected = JSON.parse(await docker([ "container", "inspect", containerId, "--format", "{{json .}}" ])) as DockerInspect;
        const containerName = (inspected.Name ?? "").replace(/^\//, "");
        const previousImage = inspected.Config?.Image ?? "";
        if (!containerName || !previousImage) throw new Error("Current container metadata is incomplete");
        const plan = this.buildPlan(inspected, safePlanId(), targetImage, previousImage);

        this.operation = { id: plan.id, state: "backing-up", message: "Mandatory backup in progress", startedAt: new Date().toISOString(), finishedAt: null, targetImage, rollbackAttempted: false };
        this.progress = null;
        await this.saveOperation();
        let backup;
        try {
            backup = await BackupManager.getInstance().runBackup({
                tag: "self-update",
                trigger: "manual",
                onProgress: (progress) => { this.progress = progress; },
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
        await fs.writeFile(path.join(STATE_DIR, `${plan.id}.json`), JSON.stringify(payload), { mode: 0o600 });

        const stateSource = stateMount.Type === "volume" ? (stateMount.Name ?? stateMount.Source) : stateMount.Source;
        const dockerSocket = process.env.DOCKGE_DOCKER_SOCKET ?? "/var/run/docker.sock";
        const socketGroup = (await fs.stat(dockerSocket)).gid;
        const args = [ "run", "-d", "--rm", "--name", `dockge-enhanced-updater-${plan.id}`, "--label", "io.dockge-enhanced.self-update=true", "--group-add", String(socketGroup), "-v", `${dockerSocket}:/var/run/docker.sock`, "-v", `${stateSource}:/state`, "-e", `SELF_UPDATE_PLAN=/state/self-update/${plan.id}.json`, "-e", `SELF_UPDATE_ALLOW_TEST_IMAGES=${process.env.DOCKGE_SELF_UPDATE_TEST_IMAGE ?? ""}`, SIDECAR_IMAGE ];
        if (plan.compose) {
            args.splice(args.length - 1, 0, "-v", `${plan.compose.workingDir}:/compose:ro`, "-e", "SELF_UPDATE_COMPOSE_DIR=/compose");
        }
        await docker(args);
        this.operation = { ...this.operation, state: "updating", message: "Updater sidecar started" };
        await this.saveOperation();
        return this.getOperation();
    }

    private getBusyReason(): string | null {
        if (ImageWatcher.getInstance().isBusy()) return "an image update or image check is in progress";
        if (BackupManager.getInstance().isBackupRunActive()) return "a Restic backup or backup verification is in progress";
        if (TrivyScanner.getInstance().getStatus().running) return "an image security scan is in progress";
        return null;
    }

    private async notify(title: string, body: string, type: "warning" | "success" | "failure"): Promise<void> {
        try {
            const watcher = ImageWatcher.getInstance().settings;
            const hostname = (await Settings.get("primaryHostname")) || "";
            const fullTitle = hostname ? `[${hostname}] ${title}` : title;
            if (watcher.discordWebhooks.length > 0) {
                await new DiscordNotifier(watcher.discordWebhooks).sendEmbed({ title: fullTitle, description: body, color: type === "failure" ? 0xef4444 : type === "success" ? 0x22c55e : 0xf59e0b, footer: `Dockge Enhanced${hostname ? ` · ${hostname}` : ""}` });
            }
            if (watcher.appriseServerUrl) {
                await new AppriseNotifier(watcher.appriseServerUrl, watcher.appriseUrls).send({ title: fullTitle, body, type });
            }
        } catch (error) {
            console.warn("[SelfUpdateManager] Notification failed:", error);
        }
    }

    private buildPlan(inspected: DockerInspect, id: string, targetImage: string, previousImage: string): SelfUpdatePlan {
        const labels = inspected.Config?.Labels ?? {};
        const workingDir = labels["com.docker.compose.project.working_dir"];
        const configFiles = labels["com.docker.compose.project.config_files"]?.split(",").map((file) => file.trim()).filter(Boolean) ?? [];
        const compose = workingDir && configFiles.length > 0 && labels["com.docker.compose.project"] && labels["com.docker.compose.service"] && configFiles.every((file) => path.dirname(file) === workingDir)
            ? { workingDir, configFiles, project: labels["com.docker.compose.project"] ?? "", service: labels["com.docker.compose.service"] ?? "dockge" }
            : undefined;
        return {
            version: 1,
            id,
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
            targetContainerId: inspected.Id ?? process.env.HOSTNAME ?? "",
            targetContainerName: (inspected.Name ?? "").replace(/^\//, ""),
            targetImage,
            previousImage,
            compose,
        };
    }

    private async getOrCreateSecret(): Promise<Buffer> {
        await fs.mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
        try { return await fs.readFile(SECRET_PATH); } catch { /* create below */ }
        const secret = crypto.randomBytes(32);
        await fs.writeFile(SECRET_PATH, secret, { mode: 0o600 });
        return secret;
    }

    private async saveOperation(): Promise<void> {
        await fs.mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
        await fs.writeFile(STATUS_PATH, JSON.stringify(this.operation, null, 2), { mode: 0o600 });
    }
}
