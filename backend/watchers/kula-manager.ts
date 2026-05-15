/**
 * KulaManager — Gère le container kula (https://github.com/c0m4r/kula)
 * Monitoring système léger : CPU, RAM, réseau, disque, containers.
 *
 * Stratégie hybride :
 * - Le container est démarré/arrêté via `docker run` / `docker stop+rm`
 *   (compatible avec tous les systèmes, dont Synology DSM dont Docker Compose v2
 *   injecte un profil AppArmor que le kernel DSM ne peut pas appliquer).
 * - Un compose.yaml est quand même écrit dans STACKS_DIR pour que l'ImageWatcher
 *   détecte c0m4r/kula:latest et surveille les mises à jour comme les autres stacks.
 * - Le compose.yaml est créé à l'activation et supprimé à la désactivation.
 *
 * Fichier : backend/watchers/kula-manager.ts
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

const DATA_DIR      = process.env.DOCKGE_DATA_DIR  ?? "/opt/dockge/data";
const STACKS_DIR    = process.env.DOCKGE_STACKS_DIR ?? "/opt/stacks";
const SETTINGS_PATH = path.join(DATA_DIR, "kula-settings.json");

export const KULA_STACK_NAME     = "kula-dockge-enhanced";
export const KULA_CONTAINER_NAME = "kula-dockge-enhanced";
export const KULA_IMAGE          = "c0m4r/kula:latest";

/** Répertoire de la stack dans STACKS_DIR (pour l'ImageWatcher uniquement) */
const KULA_STACK_DIR = path.join(STACKS_DIR, KULA_STACK_NAME);

// ─── Types ────────────────────────────────────────────────────────

export interface KulaSettings {
    enabled:     boolean;
    port:        number;              // port exposé sur l'hôte (défaut 27960)
    customUrl:   string;             // URL override (vide = auto)
    networkMode: "bridge" | "host";  // bridge = -p port:port, host = --network host
}

export type KulaStatus = "running" | "stopped" | "error";

const DEFAULT_SETTINGS: KulaSettings = {
    enabled:     false,
    port:        27960,
    customUrl:   "",
    networkMode: "bridge",
};

// ─── Singleton ────────────────────────────────────────────────────

export class KulaManager {
    private static _instance: KulaManager;

    settings: KulaSettings = { ...DEFAULT_SETTINGS };
    private _starting = false;

    static getInstance(): KulaManager {
        if (!KulaManager._instance) KulaManager._instance = new KulaManager();
        return KulaManager._instance;
    }

    // ── Settings ──────────────────────────────────────────────────

    async loadSettings(): Promise<void> {
        try {
            const raw = await fs.readFile(SETTINGS_PATH, "utf8");
            this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<KulaSettings> };
        } catch {
            this.settings = { ...DEFAULT_SETTINGS };
        }
    }

    async saveSettings(partial: Partial<KulaSettings>): Promise<void> {
        this.settings = { ...this.settings, ...partial };
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
        return { ...this.settings };
    }

    // ── Compose file (ImageWatcher uniquement) ────────────────────

    /**
     * Écrit un compose.yaml dans STACKS_DIR/kula-dockge-enhanced/ uniquement
     * pour que l'ImageWatcher détecte c0m4r/kula:latest et surveille les MàJ.
     * Ce fichier n'est PAS utilisé pour démarrer le container (docker run est utilisé).
     */
    private async _writeComposeFile(): Promise<void> {
        await fs.mkdir(KULA_STACK_DIR, { recursive: true });
        await fs.writeFile(
            path.join(KULA_STACK_DIR, "compose.yaml"),
            [
                "# Généré par Dockge-Enhanced — suivi ImageWatcher uniquement",
                "# Le container est géré via docker run, pas docker compose.",
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
            await fs.rm(KULA_STACK_DIR, { recursive: true, force: true });
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
        await this.stop();

        // Écrit le compose.yaml pour l'ImageWatcher
        await this._writeComposeFile();

        const port = this.settings.port ?? 27960;
        const networkArgs = this.settings.networkMode === "host"
            ? "--network host"
            : `-p ${port}:27960`;

        const cmd = [
            "docker run -d",
            `--name ${KULA_CONTAINER_NAME}`,
            "--pid host",
            networkArgs,
            "-v kula_dockge_data:/app/data",
            "--restart unless-stopped",
            KULA_IMAGE,
        ].join(" ");

        console.log(`[KulaManager] Démarrage : ${cmd}`);
        try {
            await execAsync(cmd);
            console.log(`[KulaManager] Container démarré (port ${port})`);
        } catch (e) {
            console.error(`[KulaManager] Échec docker run :`, e);
            throw e;
        }
    }

    async stop(): Promise<void> {
        try {
            await execAsync(`docker stop ${KULA_CONTAINER_NAME}`);
            await execAsync(`docker rm ${KULA_CONTAINER_NAME}`);
            console.log("[KulaManager] Container arrêté");
        } catch {
            // Container n'existait pas — normal
        }
    }

    async getStatus(): Promise<KulaStatus> {
        try {
            const { stdout } = await execAsync(
                `docker inspect --format "{{.State.Running}}" ${KULA_CONTAINER_NAME}`,
            );
            return stdout.trim() === "true" ? "running" : "stopped";
        } catch {
            return "stopped";
        }
    }
}
