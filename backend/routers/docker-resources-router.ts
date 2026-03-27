/**
 * DockerResourcesRouter — Liste et suppression des images et volumes Docker.
 * Routes protégées par JWT (même pattern que WatcherRouter).
 *
 * GET  /api/docker/images         → liste images + usage
 * DELETE /api/docker/images/:id   → supprime une image (?force=true)
 * POST /api/docker/images/prune   → supprime les images dangling
 * GET  /api/docker/volumes        → liste volumes + usage
 * DELETE /api/docker/volumes/:name → supprime un volume
 * POST /api/docker/volumes/prune  → supprime les volumes inutilisés
 */

import { DockgeServer } from "../dockge-server";
import { Router } from "../router";
import express, { Express, Router as ExpressRouter, Request, Response, NextFunction } from "express";
import { Settings } from "../settings";
import jwt from "jsonwebtoken";
import { JWTDecoded } from "../util-server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ─── Auth middleware (identique à WatcherRouter) ──────────────────

async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction,
    jwtSecret: string
): Promise<void> {
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

// ─── Types internes ───────────────────────────────────────────────

interface ContainerRef {
    id: string;
    name: string;
    state: string;
    status: string;
    stackName?: string;
    service?: string;
}

// ─── Helpers CLI ──────────────────────────────────────────────────

async function dockerJsonLines(cmd: string): Promise<Record<string, string>[]> {
    try {
        const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
        return (stdout || "")
            .trim()
            .split("\n")
            .filter(l => l.trim())
            .map(l => { try { return JSON.parse(l); } catch { return null; } })
            .filter(Boolean);
    } catch {
        return [];
    }
}

/** Extrait une valeur d'une chaîne de labels Docker "key=val,key2=val2" */
function label(labels: string, key: string): string | undefined {
    if (!labels) return undefined;
    for (const pair of labels.split(",")) {
        const eq = pair.indexOf("=");
        if (eq > 0 && pair.substring(0, eq).trim() === key) {
            return pair.substring(eq + 1).trim();
        }
    }
    return undefined;
}

/** Conteneurs utilisant une image (par repo:tag ou par ID) */
function imgContainers(containers: Record<string, string>[], imgName: string, imgId: string): ContainerRef[] {
    return containers
        .filter(c => {
            const img = c["Image"] ?? "";
            return img === imgName
                || img === imgId
                || imgId.replace("sha256:", "").startsWith(img.replace("sha256:", ""))
                || img.replace("sha256:", "").startsWith(imgId.replace("sha256:", ""));
        })
        .map(c => ({
            id: c["ID"] ?? "",
            name: (c["Names"] ?? "").replace(/^\//, ""),
            state: c["State"] ?? "",
            status: c["Status"] ?? "",
            stackName: label(c["Labels"] ?? "", "com.docker.compose.project"),
            service: label(c["Labels"] ?? "", "com.docker.compose.service"),
        }));
}

/** Conteneurs utilisant un volume (par nom dans Mounts) */
function volContainers(containers: Record<string, string>[], volName: string): ContainerRef[] {
    return containers
        .filter(c => {
            const mounts = (c["Mounts"] ?? "").split(",").map(m => m.trim());
            return mounts.includes(volName);
        })
        .map(c => ({
            id: c["ID"] ?? "",
            name: (c["Names"] ?? "").replace(/^\//, ""),
            state: c["State"] ?? "",
            status: c["Status"] ?? "",
            stackName: label(c["Labels"] ?? "", "com.docker.compose.project"),
            service: label(c["Labels"] ?? "", "com.docker.compose.service"),
        }));
}

function computeStatus(containers: ContainerRef[], dangling = false): string {
    if (dangling) return "dangling";
    if (containers.some(c => c.state === "running" || c.state === "restarting")) return "running";
    if (containers.length > 0) return "stopped";
    return "unused";
}

// ─── Router ───────────────────────────────────────────────────────

export class DockerResourcesRouter extends Router {
    create(app: Express, server: DockgeServer): ExpressRouter {
        const router = express.Router();
        const auth = (req: Request, res: Response, next: NextFunction) =>
            requireAuth(req, res, next, server.jwtSecret);

        // ── Images ────────────────────────────────────────────────

        router.get("/images", auth, async (_req: Request, res: Response) => {
            try {
                const [rawImgs, rawCtrs] = await Promise.all([
                    dockerJsonLines("docker images --format '{{json .}}'"),
                    dockerJsonLines("docker ps -a --format '{{json .}}'"),
                ]);

                const images = rawImgs.map(img => {
                    const isDangling = img["Repository"] === "<none>" && img["Tag"] === "<none>";
                    const name = isDangling ? img["ID"]! : `${img["Repository"]}:${img["Tag"]}`;
                    const containers = imgContainers(rawCtrs, name, img["ID"] ?? "");
                    const status = computeStatus(containers, isDangling);
                    const dockgeStacks = [...new Set(containers.map(c => c.stackName).filter(Boolean))];
                    return {
                        id: img["ID"],
                        repository: img["Repository"],
                        tag: img["Tag"],
                        size: img["Size"],
                        createdSince: img["CreatedSince"],
                        createdAt: img["CreatedAt"],
                        status,
                        containers,
                        dockgeStacks,
                    };
                });

                res.json({ ok: true, images });
            } catch (e: any) {
                res.status(500).json({ ok: false, message: e.message });
            }
        });

        router.delete("/images/:imageId", auth, async (req: Request, res: Response) => {
            const id = req.params["imageId"];
            const force = req.query["force"] === "true";
            try {
                const cmd = force ? `docker rmi --force ${id}` : `docker rmi ${id}`;
                const { stdout, stderr } = await execAsync(cmd);
                res.json({ ok: true, message: (stdout || stderr || "Supprimé").trim() });
            } catch (e: any) {
                res.status(500).json({ ok: false, message: (e.stderr || e.message || "Erreur").trim() });
            }
        });

        router.post("/images/prune", auth, async (_req: Request, res: Response) => {
            try {
                const { stdout } = await execAsync("docker image prune -f");
                res.json({ ok: true, message: stdout.trim() || "Terminé" });
            } catch (e: any) {
                res.status(500).json({ ok: false, message: e.message });
            }
        });

        // ── Volumes ───────────────────────────────────────────────

        router.get("/volumes", auth, async (_req: Request, res: Response) => {
            try {
                const [rawVols, rawCtrs] = await Promise.all([
                    dockerJsonLines("docker volume ls --format '{{json .}}'"),
                    dockerJsonLines("docker ps -a --format '{{json .}}'"),
                ]);

                const volumes = rawVols.map(vol => {
                    const containers = volContainers(rawCtrs, vol["Name"] ?? "");
                    const status = computeStatus(containers);
                    const dockgeStacks = [...new Set(containers.map(c => c.stackName).filter(Boolean))];
                    return {
                        name: vol["Name"],
                        driver: vol["Driver"],
                        mountpoint: vol["Mountpoint"],
                        scope: vol["Scope"],
                        status,
                        containers,
                        dockgeStacks,
                    };
                });

                res.json({ ok: true, volumes });
            } catch (e: any) {
                res.status(500).json({ ok: false, message: e.message });
            }
        });

        router.delete("/volumes/:name", auth, async (req: Request, res: Response) => {
            const name = req.params["name"];
            try {
                const { stdout, stderr } = await execAsync(`docker volume rm ${name}`);
                res.json({ ok: true, message: (stdout || stderr || "Supprimé").trim() });
            } catch (e: any) {
                res.status(500).json({ ok: false, message: (e.stderr || e.message || "Erreur").trim() });
            }
        });

        router.post("/volumes/prune", auth, async (_req: Request, res: Response) => {
            try {
                const { stdout } = await execAsync("docker volume prune -f");
                res.json({ ok: true, message: stdout.trim() || "Terminé" });
            } catch (e: any) {
                res.status(500).json({ ok: false, message: e.message });
            }
        });

        const mountRouter = express.Router();
        mountRouter.use("/api/docker", router);
        return mountRouter;
    }
}
