/**
 * WatcherRouter — API REST pour la config et le status en temps réel.
 * Merged: image watcher + trivy scanner + backup manager routes.
 * Adapted to Dockge Router pattern.
 *
 * Toutes les routes sont protégées par JWT via requireAuth().
 */

import { DockgeServer } from "../dockge-server";
import { Router } from "../router";
import express, { Express, Router as ExpressRouter, Request, Response, NextFunction } from "express";
import { ImageWatcher, imageStatusStore, rollbackStore, RegistryCredential, WatcherSettings } from "../watchers/image-watcher";
import { SelfUpdateChecker } from "../watchers/self-update-checker";
import { TrivyScanner } from "../watchers/trivy-scanner";
import { BackupManager } from "../watchers/backup-manager";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";
import { Settings } from "../settings";
import jwt from "jsonwebtoken";
import { JWTDecoded } from "../util-server";

// ─── Middleware d'authentification JWT ───────────────────────────
//
// Accepte le token dans :
//   - Header Authorization: Bearer <token>
//   - Query param   ?token=<token>  (pratique pour les appels fetch frontend)
//
// Respecte le setting "disableAuth" de Dockge (cohérent avec le reste de l'app).

async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction,
    jwtSecret: string
): Promise<void> {
    // Si l'auth est globalement désactivée dans Dockge, on laisse passer
    if (await Settings.get("disableAuth")) {
        next();
        return;
    }

    const authHeader = req.headers["authorization"];
    const token =
        (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined) ??
        (typeof req.query.token === "string" ? req.query.token : undefined);

    if (!token) {
        res.status(401).json({ ok: false, message: "Authentification requise" });
        return;
    }

    try {
        jwt.verify(token, jwtSecret) as JWTDecoded;
        next();
    } catch {
        res.status(401).json({ ok: false, message: "Token invalide ou expiré" });
    }
}

export class WatcherRouter extends Router {
    create(app: Express, server: DockgeServer): ExpressRouter {
        const router = express.Router();

        // JSON body parser for this router
        router.use(express.json());

        // Middleware auth sur toutes les routes de ce router
        router.use((req: Request, res: Response, next: NextFunction) => {
            requireAuth(req, res, next, server.jwtSecret).catch(next);
        });

        // ════════════════════════════════════════════════════════════════
        // IMAGE WATCHER — Settings
        // ════════════════════════════════════════════════════════════════

        router.get("/image/settings", (_req: Request, res: Response) => {
            res.json({ ok: true, data: ImageWatcher.getInstance().getSettingsSafe() });
        });

        router.post("/image/settings", async (req: Request, res: Response) => {
            try {
                await ImageWatcher.getInstance().saveSettings(req.body);
                res.json({ ok: true });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        // ════════════════════════════════════════════════════════════════
        // IMAGE WATCHER — Status (polling frontend)
        // ════════════════════════════════════════════════════════════════

        router.get("/image/status", (_req: Request, res: Response) => {
            const entries = [...imageStatusStore.values()];
            res.json({ ok: true, data: entries });
        });

        // ════════════════════════════════════════════════════════════════
        // IMAGE WATCHER — Rollback
        // ════════════════════════════════════════════════════════════════

        router.get("/image/rollback", (_req: Request, res: Response) => {
            res.json({ ok: true, data: [...rollbackStore.values()] });
        });

        router.post("/image/rollback", async (req: Request, res: Response) => {
            const { key } = req.body as { key: string };
            if (!key) return res.status(400).json({ ok: false, message: "key requis" });
            try {
                await ImageWatcher.getInstance().performRollback(key);
                res.json({ ok: true });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        router.delete("/image/rollback/:key", async (req: Request, res: Response) => {
            try {
                await ImageWatcher.getInstance().deleteRollbackEntry(
                    decodeURIComponent(req.params.key)
                );
                res.json({ ok: true });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        // ════════════════════════════════════════════════════════════════
        // IMAGE WATCHER — Check manuel immédiat
        // ════════════════════════════════════════════════════════════════

        router.post("/image/run", (_req: Request, res: Response) => {
            ImageWatcher.getInstance().runCheck().catch(console.error);
            res.json({ ok: true, message: "Vérification lancée" });
        });

        // ════════════════════════════════════════════════════════════════
        // IMAGE WATCHER — Toggle auto-update par image
        // ════════════════════════════════════════════════════════════════

        router.post("/image/auto-update", async (req: Request, res: Response) => {
            const { key, mode, time } = req.body as { key: string; mode: "off" | "immediate" | "scheduled" | "ignored"; time?: string };
            if (!key) return res.status(400).json({ ok: false, message: "key requis (format: stack::image)" });
            if (!["off", "immediate", "scheduled", "ignored"].includes(mode)) {
                return res.status(400).json({ ok: false, message: "mode invalide (off | immediate | scheduled | ignored)" });
            }
            const watcher = ImageWatcher.getInstance();
            const autoUpdateConfig = { ...(watcher.settings.autoUpdateConfig ?? {}) };
            let pendingAutoUpdates = [...(watcher.settings.pendingAutoUpdates ?? [])];

            if (mode === "off") {
                delete autoUpdateConfig[key];
                pendingAutoUpdates = pendingAutoUpdates.filter(k => k !== key);
                await watcher.saveSettings({ autoUpdateConfig, pendingAutoUpdates });
            } else {
                pendingAutoUpdates = pendingAutoUpdates.filter(k => k !== key);
                autoUpdateConfig[key] = mode === "scheduled"
                    ? { mode, time: time ?? "02:00" }
                    : { mode };
                // Active automatiquement le watcher si ce n'est pas déjà le cas
                const patch: Partial<WatcherSettings> = { autoUpdateConfig, pendingAutoUpdates };
                if (!watcher.settings.enabled && mode !== "ignored") patch.enabled = true;
                await watcher.saveSettings(patch);
            }
            return res.json({ ok: true });
        });

        // ════════════════════════════════════════════════════════════════
        // CREDENTIALS — Ajout / suppression de credentials registry
        // ════════════════════════════════════════════════════════════════

        router.post("/image/credentials", async (req: Request, res: Response) => {
            const cred: RegistryCredential = req.body;
            if (!cred.registry || !cred.username || !cred.token) {
                return res.status(400).json({ ok: false, message: "registry, username et token requis" });
            }
            const watcher = ImageWatcher.getInstance();
            const creds = watcher.settings.credentials.filter(c => c.registry !== cred.registry);
            creds.push(cred);
            await watcher.saveSettings({ credentials: creds });
            return res.json({ ok: true });
        });

        router.delete("/image/credentials/:registry", async (req: Request, res: Response) => {
            const { registry } = req.params;
            const watcher = ImageWatcher.getInstance();
            const creds = watcher.settings.credentials.filter(c => c.registry !== registry);
            await watcher.saveSettings({ credentials: creds });
            res.json({ ok: true });
        });

        // ════════════════════════════════════════════════════════════════
        // TRIVY SCANNER — Settings
        // ════════════════════════════════════════════════════════════════

        router.get("/trivy/settings", (_req: Request, res: Response) => {
            res.json({ ok: true, data: TrivyScanner.getInstance().getSettings() });
        });

        router.post("/trivy/settings", async (req: Request, res: Response) => {
            try {
                await TrivyScanner.getInstance().saveSettings(req.body);
                res.json({ ok: true });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        router.post("/trivy/run", async (req: Request, res: Response) => {
            const { image } = req.body;
            TrivyScanner.getInstance().runScan(image).catch(console.error);
            res.json({ ok: true, message: "Scan lancé" });
        });

        router.get("/trivy/status", (_req: Request, res: Response) => {
            res.json({ ok: true, data: TrivyScanner.getInstance().getStatus() });
        });

        // ════════════════════════════════════════════════════════════════
        // DISCORD — Test webhook
        // ════════════════════════════════════════════════════════════════

        router.post("/discord/test", async (req: Request, res: Response) => {
            const { webhookUrl } = req.body;
            if (!webhookUrl) return res.status(400).json({ ok: false, message: "webhookUrl requis" });
            // Accepte une string ou un tableau (test du premier webhook fourni)
            const url = Array.isArray(webhookUrl) ? webhookUrl[0] : webhookUrl;
            const ok  = await new DiscordNotifier(url).testWebhook();
            return res.json({ ok, message: ok ? "Webhook fonctionnel !" : "Échec — vérifie l'URL" });
        });

        // ════════════════════════════════════════════════════════════════
        // APPRISE — Test
        // ════════════════════════════════════════════════════════════════

        router.post("/apprise/test", async (req: Request, res: Response) => {
            const { serverUrl, urls } = req.body as { serverUrl?: string; urls?: string[] };
            if (!serverUrl) return res.status(400).json({ ok: false, message: "serverUrl requis" });
            const notifier = new AppriseNotifier(serverUrl, Array.isArray(urls) ? urls : []);
            const ok = await notifier.test();
            return res.json({ ok, message: ok ? "Apprise fonctionnel !" : "Échec — vérifie l'URL du serveur" });
        });

        // ════════════════════════════════════════════════════════════════
        // BACKUP — Settings
        // ════════════════════════════════════════════════════════════════

        router.get("/backup/settings", (_req: Request, res: Response) => {
            res.json({ ok: true, data: BackupManager.getInstance().getSettingsSafe() });
        });

        router.post("/backup/settings", async (req: Request, res: Response) => {
            try {
                await BackupManager.getInstance().saveSettings(req.body);
                res.json({ ok: true });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        // ════════════════════════════════════════════════════════════════
        // BACKUP — Actions
        // ════════════════════════════════════════════════════════════════

        router.post("/backup/run", (_req: Request, res: Response) => {
            BackupManager.getInstance().runBackup().catch(console.error);
            res.json({ ok: true, message: "Backup lancé en arrière-plan" });
        });

        router.post("/backup/init", async (_req: Request, res: Response) => {
            try {
                await BackupManager.getInstance().initRepo();
                res.json({ ok: true, message: "Repo initialisé" });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        // ════════════════════════════════════════════════════════════════
        // BACKUP — Snapshots & historique
        // ════════════════════════════════════════════════════════════════

        router.get("/backup/snapshots", async (_req: Request, res: Response) => {
            try {
                const snapshots = await BackupManager.getInstance().listSnapshots();
                res.json({ ok: true, data: snapshots });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e), data: [] });
            }
        });

        router.delete("/backup/snapshots/:id", async (req: Request, res: Response) => {
            try {
                await BackupManager.getInstance().deleteSnapshot(req.params.id);
                res.json({ ok: true });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        router.get("/backup/snapshots/:id/files", async (req: Request, res: Response) => {
            try {
                const files = await BackupManager.getInstance().listSnapshotFiles(req.params.id);
                res.json({ ok: true, data: files });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        router.post("/backup/snapshots/:id/restore", async (req: Request, res: Response) => {
            try {
                const { files } = req.body as { files: string[] };
                if (!Array.isArray(files) || files.length === 0) {
                    res.status(400).json({ ok: false, message: "Aucun fichier sélectionné" });
                    return;
                }
                const result = await BackupManager.getInstance().restoreFiles(req.params.id, files);
                res.json({ ok: result.errors.length === 0, ...result });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        router.get("/backup/history", (_req: Request, res: Response) => {
            res.json({ ok: true, data: BackupManager.getInstance().getHistory() });
        });

        router.get("/backup/dir-sizes", async (req: Request, res: Response) => {
            try {
                const raw = typeof req.query["volumes"] === "string" ? req.query["volumes"] : "";
                const selectedVolumes = raw ? raw.split(",").map(v => v.trim()).filter(Boolean) : [];
                const sizes = await BackupManager.getInstance().getDirSizes(selectedVolumes);
                res.json({ ok: true, data: sizes });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        router.get("/backup/mounted-volumes", async (_req: Request, res: Response) => {
            try {
                const vols = await BackupManager.getInstance().getMountedVolumes();
                res.json({ ok: true, data: vols });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        // Sous-dossiers d'un volume (rapide, sans tailles)
        router.get("/backup/volume-dirs", async (req: Request, res: Response) => {
            try {
                const volPath = typeof req.query["path"] === "string" ? req.query["path"] : "";
                if (!volPath) { res.status(400).json({ ok: false, message: "path requis" }); return; }
                const dirs = await BackupManager.getInstance().getVolumeDirs(volPath);
                res.json({ ok: true, data: dirs });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        // Tailles des sous-dossiers d'un volume (lent, à la demande)
        router.get("/backup/volume-sizes", async (req: Request, res: Response) => {
            try {
                const volPath = typeof req.query["path"] === "string" ? req.query["path"] : "";
                if (!volPath) { res.status(400).json({ ok: false, message: "path requis" }); return; }
                const sizes = await BackupManager.getInstance().getVolumeSubdirSizes(volPath);
                res.json({ ok: true, data: sizes });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        // ════════════════════════════════════════════════════════════════
        // SELF-UPDATE — Statut de la mise à jour de Dockge-Enhanced
        // ════════════════════════════════════════════════════════════════

        router.get("/self/status", (_req: Request, res: Response) => {
            res.json({ ok: true, ...SelfUpdateChecker.getInstance().getStatus() });
        });

        // Fuseau horaire du serveur (utilisé par le frontend pour formater les dates)
        router.get("/server-tz", (_req: Request, res: Response) => {
            res.json({ ok: true, tz: process.env.TZ || "UTC" });
        });

        // Mount everything under /api/watcher
        const mountRouter = express.Router();
        mountRouter.use("/api/watcher", router);
        return mountRouter;
    }
}
