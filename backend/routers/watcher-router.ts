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
import { ImageWatcher, imageStatusStore, RegistryCredential } from "../watchers/image-watcher";
import { SelfUpdateChecker } from "../watchers/self-update-checker";
import { TrivyScanner } from "../watchers/trivy-scanner";
import { BackupManager } from "../watchers/backup-manager";
import { DiscordNotifier } from "../notification/discord";
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
        // IMAGE WATCHER — Check manuel immédiat
        // ════════════════════════════════════════════════════════════════

        router.post("/image/run", (_req: Request, res: Response) => {
            ImageWatcher.getInstance().runCheck().catch(console.error);
            res.json({ ok: true, message: "Vérification lancée" });
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

        // ════════════════════════════════════════════════════════════════
        // SELF-UPDATE — Statut de la mise à jour de Dockge-Enhanced
        // ════════════════════════════════════════════════════════════════

        router.get("/self/status", (_req: Request, res: Response) => {
            res.json({ ok: true, ...SelfUpdateChecker.getInstance().getStatus() });
        });

        // Mount everything under /api/watcher
        const mountRouter = express.Router();
        mountRouter.use("/api/watcher", router);
        return mountRouter;
    }
}
