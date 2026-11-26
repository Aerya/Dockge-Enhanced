/**
 * KulaManager — Gère le container kula (https://github.com/c0m4r/kula)
 * Monitoring système léger : CPU, RAM, réseau, disque, containers.
 *
 * Stratégie hybride :
 * - Le container est démarré/arrêté via `docker create/cp/start` / `docker stop+rm`
 *   (compatible avec tous les systèmes, dont Synology DSM dont Docker Compose v2
 *   injecte un profil AppArmor que le kernel DSM ne peut pas appliquer).
 * - Un compose.yaml est quand même écrit dans STACKS_DIR pour que l'ImageWatcher
 *   détecte c0m4r/kula:latest et surveille les mises à jour comme les autres stacks.
 * - Le compose.yaml est créé à l'activation et supprimé à la désactivation.
 *
 * Fichier : backend/watchers/kula-manager.ts
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "node:os";
import { isIP } from "node:net";
import { parseDocument } from "yaml";
import childProcessAsync from "../buffered-process";
import { resolveDataDir } from "../data-dir";

async function docker(args: string[]): Promise<string> {
    const result = await childProcessAsync.spawn("docker", args, { encoding: "utf8" });
    if ((result.code ?? 0) !== 0) {
        throw new Error(result.stderr?.toString() || `docker ${args[0]} failed`);
    }
    return result.stdout?.toString() ?? "";
}

const DATA_DIR = resolveDataDir();
const STACKS_DIR = process.env.DOCKGE_STACKS_DIR ?? "/opt/stacks";
const SETTINGS_PATH = path.join(DATA_DIR, "kula-settings.json");

export const KULA_STACK_NAME = "kula-dockge-enhanced";
export const KULA_CONTAINER_NAME = "kula-dockge-enhanced";
export const KULA_IMAGE = "c0m4r/kula:latest";

/** Répertoire de la stack dans STACKS_DIR (pour l'ImageWatcher uniquement) */
const KULA_STACK_DIR = path.join(STACKS_DIR, KULA_STACK_NAME);

// ─── Types ────────────────────────────────────────────────────────

export interface KulaSettings {
    allowedHosts: string[];
    enabled: boolean;
    port: number;              // port exposé sur l'hôte (défaut 27960)
    customUrl: string;             // URL override (vide = auto)
    networkMode: "bridge" | "host";  // bridge = -p port:port, host = --network host
}

export type KulaStatus = "running" | "stopped" | "error";

const DEFAULT_SETTINGS: KulaSettings = {
    allowedHosts: [],
    enabled: false,
    port: 27960,
    customUrl: "",
    networkMode: "bridge",
};

/** Accept exact DNS names or IP addresses, never a wildcard or URL. */
export function normalizeKulaAllowedHosts(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 100 || value.some(host => typeof host !== "string")) {
        throw new Error("Kula: allowedHosts must be a list of at most 100 hostnames");
    }
    return [ ...new Set(value.map((entry: string) => {
        const host = entry.trim().toLowerCase().replace(/\.$/, "");
        if (!host || host.length > 253 || (!isIP(host) && !host.split(".").every(label =>
            /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
        ))) {
            throw new Error("Kula: enter exact hostnames without protocol, port, path or wildcard");
        }
        return host;
    })) ];
}

export function configureKulaHosts(source: string, hosts: string[]): string {
    const document = parseDocument(source);
    if (document.errors.length) {
        throw new Error("Kula: invalid image configuration");
    }
    document.setIn([ "web", "security", "allowed_hosts" ], normalizeKulaAllowedHosts(hosts));
    return document.toString();
}

// ─── Singleton ────────────────────────────────────────────────────

export class KulaManager {
    private static _instance: KulaManager;

    settings: KulaSettings = { ...DEFAULT_SETTINGS };
    private _starting = false;

    constructor(private readonly runDocker: typeof docker = docker) {}

    static getInstance(): KulaManager {
        if (!KulaManager._instance) {
            KulaManager._instance = new KulaManager();
        }
        return KulaManager._instance;
    }

    // ── Settings ──────────────────────────────────────────────────

    async loadSettings(): Promise<void> {
        try {
            const raw = await fs.readFile(SETTINGS_PATH, "utf8");
            this.settings = { ...DEFAULT_SETTINGS,
                ...JSON.parse(raw) as Partial<KulaSettings> };
        } catch {
            this.settings = { ...DEFAULT_SETTINGS };
        }
    }

    async saveSettings(partial: Partial<KulaSettings>): Promise<void> {
        if (this._starting) {
            throw new Error("Kula: startup in progress, retry saving after it finishes");
        }
        const allowedHosts = normalizeKulaAllowedHosts(partial.allowedHosts === undefined ? this.settings.allowedHosts : partial.allowedHosts);
        this.settings = { ...this.settings,
            ...partial,
            allowedHosts };
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2));
        if (this.settings.enabled) {
            await this.start();
        } else {
            await this.stop();
            await this._removeStackDir();
        }
    }

    getSettingsSafe(): KulaSettings {
        return { ...this.settings,
            allowedHosts: [ ...this.settings.allowedHosts ] };
    }

    // ── Compose file (ImageWatcher uniquement) ────────────────────

    /**
     * Écrit un compose.yaml dans STACKS_DIR/kula-dockge-enhanced/ uniquement
     * pour que l'ImageWatcher détecte c0m4r/kula:latest et surveille les MàJ.
     * Ce fichier n'est PAS utilisé pour démarrer le container (docker create/cp/start est utilisé).
     */
    private async _writeComposeFile(): Promise<void> {
        await fs.mkdir(KULA_STACK_DIR, { recursive: true });
        await fs.writeFile(
            path.join(KULA_STACK_DIR, "compose.yaml"),
            [
                "# Généré par Dockge-Enhanced — suivi ImageWatcher uniquement",
                "# Le container est géré via docker create/cp/start, pas docker compose.",
                "services:",
                "  kula:",
                `    image: ${KULA_IMAGE}`,
                `    container_name: ${KULA_CONTAINER_NAME}`,
                "",
            ].join("\n"),
            "utf8",
        );
    }

    private async _removeStackDir(): Promise<void> {
        try {
            await fs.rm(KULA_STACK_DIR, { recursive: true,
                force: true });
            console.log(`[KulaManager] Stack directory supprimé : ${KULA_STACK_DIR}`);
        } catch {
            // Non bloquant
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────

    async startIfEnabled(): Promise<void> {
        await this.loadSettings();
        if (this.settings.enabled) {
            await this.start();
        }
    }

    async start(): Promise<void> {
        if (this._starting) {
            console.log("[KulaManager] Démarrage déjà en cours, ignoré");
            return;
        }
        this._starting = true;
        try {
            await this._doStart();
        } finally {
            this._starting = false;
        }
    }

    private async _doStart(): Promise<void> {
        const hosts = normalizeKulaAllowedHosts(this.settings.allowedHosts);
        await this.stop();

        // Écrit le compose.yaml pour l'ImageWatcher
        await this._writeComposeFile();

        const port = this.settings.port ?? 27960;
        const args = [
            "create",
            "--name", KULA_CONTAINER_NAME,
            "--pid", "host",
            ...(this.settings.networkMode === "host"
                ? [ "--network", "host" ]
                : [ "-p", `${port}:27960` ]),
            "-v", "kula_dockge_data:/app/data",
            "--restart", "unless-stopped",
            KULA_IMAGE,
        ];

        console.log(`[KulaManager] Démarrage du conteneur sur le port ${port}`);
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-kula-"));
        const config = path.join(directory, "config.yaml");
        let created = false;
        try {
            // Copy through Docker: Dockge's filesystem paths need not exist on the daemon host.
            // Preserve the image's defaults (storage, listen address, security, etc.).
            await this.runDocker(args);
            created = true;
            await this.runDocker([ "cp", `${KULA_CONTAINER_NAME}:/app/config.yaml`, config ]);
            await fs.writeFile(config, configureKulaHosts(await fs.readFile(config, "utf8"), hosts));
            await fs.chmod(config, 0o644); // readable by the image's unprivileged Kula user
            await this.runDocker([ "cp", config, `${KULA_CONTAINER_NAME}:/app/config.yaml` ]);
            await this.runDocker([ "start", KULA_CONTAINER_NAME ]);
            console.log(`[KulaManager] Container démarré (port ${port})`);
        } catch (e) {
            console.error("[KulaManager] Échec du démarrage :", e);
            if (created) {
                await this.runDocker([ "rm", "-f", KULA_CONTAINER_NAME ]).catch(() => {});
            }
            throw e;
        } finally {
            await fs.rm(directory, { recursive: true,
                force: true });
        }
    }

    async stop(): Promise<void> {
        try {
            await this.runDocker([ "stop", KULA_CONTAINER_NAME ]);
            await this.runDocker([ "rm", KULA_CONTAINER_NAME ]);
            console.log("[KulaManager] Container arrêté");
        } catch {
            // Container n'existait pas — normal
        }
    }

    async getStatus(): Promise<KulaStatus> {
        try {
            const stdout = await this.runDocker([ "inspect", "--format", "{{.State.Running}}", KULA_CONTAINER_NAME ]);
            return stdout.trim() === "true" ? "running" : "stopped";
        } catch {
            return "stopped";
        }
    }
}
