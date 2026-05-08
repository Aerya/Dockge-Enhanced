/**
 * KulaManager — Gère le container kula (https://github.com/c0m4r/kula)
 * Monitoring système léger : CPU, RAM, réseau, disque, containers.
 * Fichier : backend/watchers/kula-manager.ts
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

const DATA_DIR    = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH = path.join(DATA_DIR, "kula-settings.json");

export const KULA_CONTAINER_NAME = "kula-dockge-enhanced";
export const KULA_IMAGE          = "c0m4r/kula:latest";

// ─── Types ────────────────────────────────────────────────────────

export interface KulaSettings {
    enabled:    boolean;
    port:       number;    // port exposé sur l'hôte (défaut 27960)
    customUrl:  string;    // URL override (vide = auto)
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
        }
    }

    getSettingsSafe(): KulaSettings {
        return { ...this.settings };
    }

    // ── Lifecycle ─────────────────────────────────────────────────

    async startIfEnabled(): Promise<void> {
        await this.loadSettings();
        if (this.settings.enabled) {
            await this.start();
        }
    }

    async start(): Promise<void> {
        // Stoppe une éventuelle instance existante (port changé, etc.)
        await this.stop();

        const port = this.settings.port ?? 27960;

        const networkArgs = this.settings.networkMode === "host"
            ? "--network host"
            : `-p ${port}:27960`;

        const cmd = [
            "docker run -d",
            `--name ${KULA_CONTAINER_NAME}`,
            "--pid host",
            networkArgs,
            "-v /proc:/proc:ro",
            "-v kula_dockge_data:/app/data",
            "--restart unless-stopped",
            KULA_IMAGE,
        ].join(" ");

        console.log(`[KulaManager] Démarrage : ${cmd}`);
        await execAsync(cmd);
        console.log(`[KulaManager] Container démarré sur le port ${port}`);
    }

    async stop(): Promise<void> {
        try {
            await execAsync(`docker stop ${KULA_CONTAINER_NAME}`);
            await execAsync(`docker rm ${KULA_CONTAINER_NAME}`);
            console.log("[KulaManager] Container arrêté et supprimé");
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
