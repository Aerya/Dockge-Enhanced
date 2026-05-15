/**
 * KulaManager — Gère le container kula (https://github.com/c0m4r/kula)
 * Monitoring système léger : CPU, RAM, réseau, disque, containers.
 *
 * Déploiement via compose stack dans STACKS_DIR pour que l'ImageWatcher
 * surveille automatiquement les mises à jour de c0m4r/kula:latest.
 * La stack est créée à l'activation et supprimée à la désactivation.
 *
 * Fichier : backend/watchers/kula-manager.ts
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

const DATA_DIR      = process.env.DOCKGE_DATA_DIR   ?? "/opt/dockge/data";
const STACKS_DIR    = process.env.DOCKGE_STACKS_DIR  ?? "/opt/stacks";
const SETTINGS_PATH = path.join(DATA_DIR, "kula-settings.json");

export const KULA_STACK_NAME     = "kula-dockge-enhanced";
export const KULA_CONTAINER_NAME = "kula-dockge-enhanced";
export const KULA_IMAGE          = "c0m4r/kula:latest";

/** Répertoire de la stack dans STACKS_DIR */
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

    // ── Compose file ──────────────────────────────────────────────

    /**
     * Génère le compose.yaml correspondant aux settings actuels.
     * - container_name fixe pour que getStatus() fonctionne avec docker inspect
     * - volume nommé explicitement (name: kula_dockge_data) pour ne pas
     *   hériter du préfixe de projet et préserver les données existantes
     */
    private _buildComposeYaml(): string {
        const port = this.settings.port ?? 27960;
        const isHost = this.settings.networkMode === "host";

        const networkSection = isHost
            ? "    network_mode: host"
            : `    ports:\n      - "${port}:27960"`;

        return [
            "# Généré automatiquement par Dockge-Enhanced — ne pas modifier manuellement",
            "services:",
            "  kula:",
            `    image: ${KULA_IMAGE}`,
            `    container_name: ${KULA_CONTAINER_NAME}`,
            "    pid: host",
            "    restart: unless-stopped",
            networkSection,
            "    volumes:",
            "      - /proc:/proc:ro",
            "      - kula_dockge_data:/app/data",
            "",
            "volumes:",
            "  kula_dockge_data:",
            "    name: kula_dockge_data",
            "",
        ].join("\n");
    }

    private async _writeComposeFile(): Promise<void> {
        await fs.mkdir(KULA_STACK_DIR, { recursive: true });
        await fs.writeFile(
            path.join(KULA_STACK_DIR, "compose.yaml"),
            this._buildComposeYaml(),
            "utf8",
        );
    }

    private async _stackDirExists(): Promise<boolean> {
        try {
            await fs.access(KULA_STACK_DIR);
            return true;
        } catch {
            return false;
        }
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
        // Arrête toute instance existante (ancienne docker run ou compose précédent)
        await this.stop();

        // Écrit le compose.yaml à jour (port, networkMode, etc.)
        await this._writeComposeFile();

        console.log(`[KulaManager] Démarrage via compose dans ${KULA_STACK_DIR}`);
        await execAsync("docker compose up -d --pull always", { cwd: KULA_STACK_DIR });
        console.log(`[KulaManager] Container démarré (port ${this.settings.port})`);
    }

    async stop(): Promise<void> {
        // 1. Arrêt propre via compose si la stack existe
        if (await this._stackDirExists()) {
            try {
                await execAsync("docker compose down", { cwd: KULA_STACK_DIR });
                console.log("[KulaManager] Stack compose arrêtée");
            } catch {
                // Compose non disponible ou stack déjà arrêtée
            }
        }

        // 2. Fallback : stoppe le container directement (migration depuis docker run)
        try {
            await execAsync(`docker stop ${KULA_CONTAINER_NAME}`);
            await execAsync(`docker rm ${KULA_CONTAINER_NAME}`);
            console.log("[KulaManager] Container direct arrêté (migration docker run)");
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
