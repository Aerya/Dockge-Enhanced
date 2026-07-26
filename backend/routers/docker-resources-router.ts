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
import { exec } from "child_process";
import { promisify } from "util";
import { AutoPruneManager } from "../watchers/auto-prune-manager";
import { AuditLogger, setAuditUser } from "../audit-log";
import { requireHttpAuth } from "../auth";
import childProcessAsync from "promisify-child-process";

const execAsync = promisify(exec);

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

async function dockerArgs(args: string[]): Promise<string> {
    const result = await childProcessAsync.spawn("docker", args, {
        encoding: "utf-8",
        maxBuffer: 20 * 1024 * 1024,
    });
    const output = `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`.trim();
    if ((result.code ?? 0) !== 0) {
        throw new Error(output || `docker ${args[0]} failed`);
    }
    return output;
}

function safeDockerName(value: unknown, labelName: string): string {
    const name = String(value ?? "").trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(name)) {
        throw new Error(`${labelName} invalide`);
    }
    return name;
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

/**
 * Conteneurs utilisant un volume — basé sur docker inspect (fiable pour les
 * volumes anonymes dont le nom est un hash SHA256, absents de "docker ps Mounts").
 */
function volContainersFromInspect(
    inspectData: Record<string, unknown>[],
    volName: string
): ContainerRef[] {
    return inspectData
        .filter(c => {
            const mounts = (c["Mounts"] as Record<string, string>[]) ?? [];
            return mounts.some(m => m["Name"] === volName || m["Source"] === volName);
        })
        .map(c => {
            const labelsObj = (c["Config"] as any)?.Labels ?? {};
            return {
                id: ((c["Id"] as string) ?? "").slice(0, 12),
                name: ((c["Name"] as string) ?? "").replace(/^\//, ""),
                state: (c["State"] as any)?.Status ?? "",
                status: (c["State"] as any)?.Status ?? "",
                stackName: labelsObj["com.docker.compose.project"],
                service: labelsObj["com.docker.compose.service"],
            };
        });
}

function computeStatus(containers: ContainerRef[], dangling = false): string {
    if (dangling) return "dangling";
    if (containers.some(c => c.state === "running" || c.state === "restarting")) return "running";
    if (containers.length > 0) return "stopped";
    return "unused";
}

async function auditDockerAction(
    req: Request,
    action: string,
    targetType: string,
    target: string | null,
    status: "success" | "failure" = "success",
    message?: string | null,
    metadata?: unknown
) {
    await AuditLogger.getInstance().logFromRequest(req, {
        action,
        category: "docker",
        targetType,
        target,
        status,
        message,
        metadata,
    });
}

// ─── Router ───────────────────────────────────────────────────────

export class DockerResourcesRouter extends Router {
    create(app: Express, server: DockgeServer): ExpressRouter {
        const router = express.Router();
        router.use(express.json());
        const auth = (req: Request, res: Response, next: NextFunction) =>
            requireHttpAuth(req, res, next, server.jwtSecret, (identity) => {
                setAuditUser(req, { username: identity.username });
            }).catch(next);

        // ── Images ────────────────────────────────────────────────

        router.get("/images", auth, async (_req: Request, res: Response) => {
            try {
                const [rawImgs, allDangling, rawCtrs] = await Promise.all([
                    dockerJsonLines("docker images --format '{{json .}}'"),
                    // -a --filter dangling=true capture les couches intermédiaires orphelines
                    // que docker images (sans -a) ne montre pas, mais que docker image prune supprime
                    dockerJsonLines("docker images -a --filter dangling=true --format '{{json .}}'"),
                    dockerJsonLines("docker ps -a --format '{{json .}}'"),
                ]);

                // Merge : on ajoute les dangling intermédiaires absents de la liste principale
                const seenIds = new Set(rawImgs.map(img => img["ID"]));
                const extraDangling = allDangling.filter(img => !seenIds.has(img["ID"]));
                const mergedImgs = [...rawImgs, ...extraDangling];

                const images = mergedImgs.map(img => {
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
                const message = (stdout || stderr || "Supprimé").trim();
                await auditDockerAction(req, "docker.image.delete", "image", id, "success", message, { force });
                res.json({ ok: true, message });
            } catch (e: any) {
                const message = (e.stderr || e.message || "Erreur").trim();
                await auditDockerAction(req, "docker.image.delete", "image", id, "failure", message, { force });
                res.status(500).json({ ok: false, message });
            }
        });

        router.post("/images/prune", auth, async (req: Request, res: Response) => {
            try {
                const { stdout } = await execAsync("docker image prune -f");
                const message = stdout.trim() || "Terminé";
                await auditDockerAction(req, "docker.image.prune_dangling", "image", "dangling", "success", message);
                res.json({ ok: true, message });
            } catch (e: any) {
                await auditDockerAction(req, "docker.image.prune_dangling", "image", "dangling", "failure", e.message);
                res.status(500).json({ ok: false, message: e.message });
            }
        });

        // Supprime toutes les images non utilisées par un conteneur (orphelines + inutilisées taguées)
        router.post("/images/prune-unused", auth, async (req: Request, res: Response) => {
            try {
                const { stdout } = await execAsync("docker image prune -a -f");
                const message = stdout.trim() || "Terminé";
                await auditDockerAction(req, "docker.image.prune_unused", "image", "unused", "success", message);
                res.json({ ok: true, message });
            } catch (e: any) {
                await auditDockerAction(req, "docker.image.prune_unused", "image", "unused", "failure", e.message);
                res.status(500).json({ ok: false, message: e.message });
            }
        });

        // ── Volumes ───────────────────────────────────────────────

        router.get("/volumes", auth, async (_req: Request, res: Response) => {
            try {
                const rawVols = await dockerJsonLines("docker volume ls --format '{{json .}}'");

                // docker inspect donne les vrais noms de volumes (y compris anonymes SHA256)
                let inspectData: Record<string, unknown>[] = [];
                try {
                    const { stdout: ids } = await execAsync("docker ps -aq 2>/dev/null || true");
                    const idList = ids.trim();
                    if (idList) {
                        const { stdout: inspectOut } = await execAsync(
                            `docker inspect ${idList.split("\n").join(" ")}`,
                            { maxBuffer: 20 * 1024 * 1024 }
                        );
                        inspectData = JSON.parse(inspectOut) as Record<string, unknown>[];
                    }
                } catch { /* pas de conteneurs ou docker indisponible */ }

                const volumes = rawVols.map(vol => {
                    const containers = volContainersFromInspect(inspectData, vol["Name"] ?? "");
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
                const message = (stdout || stderr || "Supprimé").trim();
                await auditDockerAction(req, "docker.volume.delete", "volume", name, "success", message);
                res.json({ ok: true, message });
            } catch (e: any) {
                const message = (e.stderr || e.message || "Erreur").trim();
                await auditDockerAction(req, "docker.volume.delete", "volume", name, "failure", message);
                res.status(500).json({ ok: false, message });
            }
        });

        router.post("/volumes/prune", auth, async (req: Request, res: Response) => {
            try {
                const { stdout } = await execAsync("docker volume prune -f");
                const message = stdout.trim() || "Terminé";
                await auditDockerAction(req, "docker.volume.prune", "volume", "unused", "success", message);
                res.json({ ok: true, message });
            } catch (e: any) {
                await auditDockerAction(req, "docker.volume.prune", "volume", "unused", "failure", e.message);
                res.status(500).json({ ok: false, message: e.message });
            }
        });

        // ── Containers ────────────────────────────────────────────

        router.get("/containers", auth, async (_req: Request, res: Response) => {
            try {
                const rawCtrs = await dockerJsonLines("docker ps -a --format '{{json .}}'");
                const containers = rawCtrs.map(c => ({
                    id: c["ID"] ?? "",
                    name: (c["Names"] ?? "").replace(/^\//, ""),
                    image: c["Image"] ?? "",
                    state: c["State"] ?? "",
                    status: c["Status"] ?? "",
                    createdSince: c["RunningFor"] ?? c["CreatedAt"] ?? "",
                    stackName: label(c["Labels"] ?? "", "com.docker.compose.project"),
                    service: label(c["Labels"] ?? "", "com.docker.compose.service"),
                }));
                res.json({ ok: true, containers });
            } catch (e: any) {
                res.status(500).json({ ok: false, message: e.message });
            }
        });

        router.post("/containers/:id/stop", auth, async (req: Request, res: Response) => {
            const id = req.params["id"];
            try {
                const { stdout, stderr } = await execAsync(`docker stop ${id}`);
                const message = (stdout || stderr || "Arrêté").trim();
                await auditDockerAction(req, "docker.container.stop", "container", id, "success", message);
                res.json({ ok: true, message });
            } catch (e: any) {
                const message = (e.stderr || e.message || "Erreur").trim();
                await auditDockerAction(req, "docker.container.stop", "container", id, "failure", message);
                res.status(500).json({ ok: false, message });
            }
        });

        router.delete("/containers/:id", auth, async (req: Request, res: Response) => {
            const id = req.params["id"];
            const force = req.query["force"] === "true";
            try {
                const cmd = force ? `docker rm --force ${id}` : `docker rm ${id}`;
                const { stdout, stderr } = await execAsync(cmd);
                const message = (stdout || stderr || "Supprimé").trim();
                await auditDockerAction(req, "docker.container.delete", "container", id, "success", message, { force });
                res.json({ ok: true, message });
            } catch (e: any) {
                const message = (e.stderr || e.message || "Erreur").trim();
                await auditDockerAction(req, "docker.container.delete", "container", id, "failure", message, { force });
                res.status(500).json({ ok: false, message });
            }
        });

        // ── Networks ──────────────────────────────────────────────

        router.get("/networks", auth, async (_req: Request, res: Response) => {
            try {
                const rows = await dockerJsonLines("docker network ls --format '{{json .}}'");
                const names = rows.map(row => row["Name"]).filter(Boolean);
                let inspected: any[] = [];
                if (names.length > 0) {
                    const output = await dockerArgs([ "network", "inspect", ...names ]);
                    inspected = JSON.parse(output);
                }
                const byName = new Map(inspected.map(network => [ network.Name, network ]));
                const networks = rows.map(row => {
                    const details = byName.get(row["Name"]) ?? {};
                    const labels = details.Labels ?? {};
                    return {
                        id: row["ID"] ?? details.Id ?? "",
                        name: row["Name"] ?? details.Name ?? "",
                        driver: row["Driver"] ?? details.Driver ?? "",
                        scope: row["Scope"] ?? details.Scope ?? "",
                        internal: Boolean(details.Internal),
                        attachable: Boolean(details.Attachable),
                        ingress: Boolean(details.Ingress),
                        dockerManaged: [ "bridge", "host", "none" ].includes(row["Name"] ?? ""),
                        composeProject: labels["com.docker.compose.project"] ?? null,
                        dockgeManaged: labels["com.dockge-enhanced.managed"] === "true",
                        containers: Object.entries(details.Containers ?? {}).map(([ id, container ]: [string, any]) => ({
                            id: id.slice(0, 12),
                            name: container.Name ?? id.slice(0, 12),
                            ipv4: container.IPv4Address ?? "",
                            ipv6: container.IPv6Address ?? "",
                        })),
                        ipam: details.IPAM?.Config ?? [],
                        options: details.Options ?? {},
                        labels,
                    };
                });
                res.json({ ok: true,
                    networks });
            } catch (e: any) {
                res.status(500).json({ ok: false,
                    message: e.message });
            }
        });

        router.post("/networks", auth, async (req: Request, res: Response) => {
            try {
                const name = safeDockerName(req.body?.name, "Nom de réseau");
                const driver = String(req.body?.driver ?? "bridge");
                if (![ "bridge", "macvlan", "ipvlan" ].includes(driver)) {
                    throw new Error("Driver non pris en charge. Docker Swarm et overlay ne sont pas pris en charge.");
                }
                const args = [
                    "network", "create",
                    "--driver", driver,
                    "--label", "com.dockge-enhanced.managed=true",
                ];
                if (req.body?.internal === true) {
                    args.push("--internal");
                }
                const subnet = String(req.body?.subnet ?? "").trim();
                const gateway = String(req.body?.gateway ?? "").trim();
                const parent = String(req.body?.parent ?? "").trim();
                if (subnet) {
                    if (!/^[0-9a-fA-F:.]+\/\d{1,3}$/.test(subnet)) throw new Error("Sous-réseau invalide");
                    args.push("--subnet", subnet);
                }
                if (gateway) {
                    if (!/^[0-9a-fA-F:.]+$/.test(gateway)) throw new Error("Passerelle invalide");
                    args.push("--gateway", gateway);
                }
                if (parent) {
                    const safeParent = safeDockerName(parent, "Interface parente");
                    args.push("--opt", `parent=${safeParent}`);
                }
                args.push(name);
                const message = await dockerArgs(args);
                await auditDockerAction(req, "docker.network.create", "network", name, "success", message, {
                    driver,
                    internal: req.body?.internal === true,
                    subnet: subnet || null,
                    gateway: gateway || null,
                });
                res.status(201).json({ ok: true,
                    message });
            } catch (e: any) {
                await auditDockerAction(req, "docker.network.create", "network", String(req.body?.name ?? ""), "failure", e.message);
                res.status(400).json({ ok: false,
                    message: e.message });
            }
        });

        router.delete("/networks/:name", auth, async (req: Request, res: Response) => {
            let name = String(req.params.name ?? "");
            try {
                name = safeDockerName(name, "Nom de réseau");
                if (req.body?.confirmed !== true) {
                    throw new Error("Confirmation explicite requise");
                }
                if ([ "bridge", "host", "none" ].includes(name)) {
                    throw new Error("Les réseaux Docker système sont protégés");
                }
                const inspect = JSON.parse(await dockerArgs([ "network", "inspect", name ]))[0] ?? {};
                const connected = Object.keys(inspect.Containers ?? {});
                if (connected.length > 0) {
                    throw new Error(`Réseau utilisé par ${connected.length} conteneur(s)`);
                }
                const message = await dockerArgs([ "network", "rm", name ]);
                await auditDockerAction(req, "docker.network.delete", "network", name, "success", message);
                res.json({ ok: true,
                    message });
            } catch (e: any) {
                await auditDockerAction(req, "docker.network.delete", "network", name, "failure", e.message);
                res.status(400).json({ ok: false,
                    message: e.message });
            }
        });

        router.post("/networks/:name/connect", auth, async (req: Request, res: Response) => {
            let name = String(req.params.name ?? "");
            try {
                name = safeDockerName(name, "Nom de réseau");
                if (req.body?.confirmed !== true) throw new Error("Confirmation explicite requise");
                const container = safeDockerName(req.body?.container, "Conteneur");
                const message = await dockerArgs([ "network", "connect", name, container ]);
                await auditDockerAction(req, "docker.network.connect", "network", name, "success", message, { container });
                res.json({ ok: true,
                    message });
            } catch (e: any) {
                await auditDockerAction(req, "docker.network.connect", "network", name, "failure", e.message);
                res.status(400).json({ ok: false,
                    message: e.message });
            }
        });

        router.post("/networks/:name/disconnect", auth, async (req: Request, res: Response) => {
            let name = String(req.params.name ?? "");
            try {
                name = safeDockerName(name, "Nom de réseau");
                if (req.body?.confirmed !== true) throw new Error("Confirmation explicite requise");
                const container = safeDockerName(req.body?.container, "Conteneur");
                const message = await dockerArgs([ "network", "disconnect", name, container ]);
                await auditDockerAction(req, "docker.network.disconnect", "network", name, "success", message, { container });
                res.json({ ok: true,
                    message });
            } catch (e: any) {
                await auditDockerAction(req, "docker.network.disconnect", "network", name, "failure", e.message);
                res.status(400).json({ ok: false,
                    message: e.message });
            }
        });

        // ── Auto-prune ────────────────────────────────────────────

        router.get("/auto-prune/settings", auth, (_req: Request, res: Response) => {
            res.json({ ok: true, data: AutoPruneManager.getInstance().getSettings() });
        });

        router.post("/auto-prune/settings", auth, async (req: Request, res: Response) => {
            try {
                const { danglingEnabled, danglingIntervalHours, unusedEnabled, unusedIntervalHours } = req.body ?? {};
                await AutoPruneManager.getInstance().updateSettings({
                    danglingEnabled, danglingIntervalHours,
                    unusedEnabled,   unusedIntervalHours,
                });
                await auditDockerAction(req, "docker.auto_prune.settings", "setting", "auto-prune", "success", null, {
                    danglingEnabled,
                    danglingIntervalHours,
                    unusedEnabled,
                    unusedIntervalHours,
                });
                res.json({ ok: true });
            } catch (e: any) {
                await auditDockerAction(req, "docker.auto_prune.settings", "setting", "auto-prune", "failure", e.message);
                res.status(500).json({ ok: false, message: e.message });
            }
        });

        // Exclusions pour le mode "inutilisées" (repo:tag uniquement)
        router.post("/auto-prune/exclusions/unused", auth, (req: Request, res: Response) => {
            const { nameTag } = req.body ?? {};
            if (!nameTag) {
                res.status(400).json({ ok: false, message: "nameTag requis" });
                return;
            }
            AutoPruneManager.getInstance().addUnusedExclusion(nameTag);
            auditDockerAction(req, "docker.auto_prune.exclusion.add", "image", nameTag).catch(() => {});
            res.json({ ok: true });
        });

        router.delete("/auto-prune/exclusions/unused/:nameTag", auth, (req: Request, res: Response) => {
            const nameTag = decodeURIComponent(req.params["nameTag"]);
            AutoPruneManager.getInstance().removeUnusedExclusion(nameTag);
            auditDockerAction(req, "docker.auto_prune.exclusion.remove", "image", nameTag).catch(() => {});
            res.json({ ok: true });
        });

        // Exécution manuelle — un endpoint par mode
        router.post("/auto-prune/run/dangling", auth, async (req: Request, res: Response) => {
            try {
                const result = await AutoPruneManager.getInstance().runDanglingPrune();
                await auditDockerAction(req, "docker.auto_prune.run_dangling", "image", "dangling", "success", result.summary, result);
                res.json({ ok: true, ...result });
            } catch (e: any) {
                await auditDockerAction(req, "docker.auto_prune.run_dangling", "image", "dangling", "failure", e.message);
                res.status(500).json({ ok: false, message: e.message });
            }
        });

        router.post("/auto-prune/run/unused", auth, async (req: Request, res: Response) => {
            try {
                const result = await AutoPruneManager.getInstance().runUnusedPrune();
                await auditDockerAction(req, "docker.auto_prune.run_unused", "image", "unused", "success", result.summary, result);
                res.json({ ok: true, ...result });
            } catch (e: any) {
                await auditDockerAction(req, "docker.auto_prune.run_unused", "image", "unused", "failure", e.message);
                res.status(500).json({ ok: false, message: e.message });
            }
        });

        const mountRouter = express.Router();
        mountRouter.use("/api/docker", router);
        return mountRouter;
    }
}
