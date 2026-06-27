/**
 * Navigateur/éditeur de fichiers de volumes.
 *
 * Le backend Dockge ne voit pas forcément les chemins hôte des binds/volumes
 * (ils ne sont pas montés dans son conteneur). On passe donc par le socket
 * Docker (`docker exec` / `docker inspect`) pour lister, lire et écrire les
 * fichiers directement dans l'espace de montage du conteneur du service.
 *
 * Sécurité : toute opération est restreinte aux points de montage déclarés du
 * conteneur (Destinations). On refuse tout chemin qui en sort. Le service donne
 * de toute façon déjà un accès shell complet via la console — ce navigateur
 * n'élargit pas la surface, il la rend juste plus pratique.
 */
import { Stack } from "./stack";
import { DockgeServer } from "./dockge-server";
import childProcessAsync from "promisify-child-process";
import { spawn } from "child_process";
import path from "path";

const MAX_FILE_SIZE = 512 * 1024; // 512 Kio — au-delà on refuse (éditeur texte)
const MAX_ENTRIES = 5000;

export interface VolumeMount {
    type: string;        // bind | volume
    source: string;      // chemin hôte ou nom de volume
    destination: string; // point de montage dans le conteneur
    rw: boolean;
}

export interface DirEntry {
    name: string;
    type: "dir" | "file";
}

/** Échappe une chaîne pour une utilisation entre quotes simples shell. */
function shQuote(s: string): string {
    return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** Résout l'ID du conteneur du service via `docker compose ps -q`. */
async function resolveContainerId(server: DockgeServer, stackName: string, service: string): Promise<string> {
    const stack = await Stack.getStack(server, stackName);
    const res = await childProcessAsync.spawn(
        "docker",
        stack.getComposeOptions("ps", "-q", service),
        { cwd: stack.path, encoding: "utf-8" }
    );
    const id = (res.stdout?.toString() ?? "").trim().split("\n")[0].trim();
    if (!id) {
        throw new Error("Conteneur introuvable ou arrêté pour ce service");
    }
    return id;
}

/** Liste les montages (binds + volumes) du conteneur. */
async function inspectMounts(cid: string): Promise<VolumeMount[]> {
    const res = await childProcessAsync.spawn(
        "docker",
        [ "inspect", "--format", "{{json .Mounts}}", cid ],
        { encoding: "utf-8" }
    );
    let raw: Array<Record<string, unknown>>;
    try {
        raw = JSON.parse(res.stdout?.toString() ?? "[]") ?? [];
    } catch {
        raw = [];
    }
    return raw
        .map((m) => ({
            type: String(m.Type ?? ""),
            source: String(m.Source ?? m.Name ?? ""),
            destination: String(m.Destination ?? ""),
            rw: m.RW !== false,
        }))
        .filter((m) => m.type === "bind" || m.type === "volume");
}

/** Prépare conteneur + montages en une fois. */
async function prepare(server: DockgeServer, stackName: string, service: string): Promise<{ cid: string; mounts: VolumeMount[] }> {
    const cid = await resolveContainerId(server, stackName, service);
    const mounts = await inspectMounts(cid);
    return { cid, mounts };
}

/** Normalise et vérifie qu'un chemin reste dans un des montages du conteneur. */
function assertWithinMounts(reqPath: string, mounts: VolumeMount[]): string {
    if (typeof reqPath !== "string" || reqPath.trim() === "") {
        throw new Error("Chemin invalide");
    }
    const norm = path.posix.normalize(reqPath);
    if (!norm.startsWith("/")) {
        throw new Error("Chemin invalide");
    }
    for (const m of mounts) {
        if (!m.destination) {
            continue;
        }
        const dest = path.posix.normalize(m.destination);
        if (norm === dest || norm.startsWith(dest.endsWith("/") ? dest : dest + "/")) {
            return norm;
        }
    }
    throw new Error("Chemin hors des volumes du conteneur");
}

/** Retourne la liste des montages éditables du service. */
export async function getVolumeMounts(server: DockgeServer, stackName: string, service: string): Promise<VolumeMount[]> {
    const { mounts } = await prepare(server, stackName, service);
    return mounts;
}

/** Liste le contenu d'un répertoire (dossiers d'abord, puis fichiers). */
export async function listDir(server: DockgeServer, stackName: string, service: string, dirPath: string): Promise<DirEntry[]> {
    const { cid, mounts } = await prepare(server, stackName, service);
    const norm = assertWithinMounts(dirPath, mounts);

    const res = await childProcessAsync.spawn(
        "docker",
        [ "exec", cid, "ls", "-1Ap", "--", norm ],
        { encoding: "utf-8" }
    );

    const lines = (res.stdout?.toString() ?? "")
        .split("\n")
        .map((l) => l.replace(/\r$/, ""))
        .filter((l) => l.length > 0)
        .slice(0, MAX_ENTRIES);

    const entries: DirEntry[] = [];
    for (const line of lines) {
        // `ls -p` suffixe les dossiers d'un /. On ignore les autres suffixes
        // de type (@ lien, = socket, | fifo) en ne marquant que les dossiers.
        if (line.endsWith("/")) {
            entries.push({ name: line.slice(0, -1), type: "dir" });
        } else {
            // Retire un éventuel suffixe de type non géré
            const name = line.replace(/[*=|@]$/, "");
            entries.push({ name, type: "file" });
        }
    }

    entries.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === "dir" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });

    return entries;
}

/** Lit un fichier texte (refuse les fichiers trop gros ou binaires). */
export async function readFile(server: DockgeServer, stackName: string, service: string, filePath: string): Promise<string> {
    const { cid, mounts } = await prepare(server, stackName, service);
    const norm = assertWithinMounts(filePath, mounts);

    // Taille
    const sizeRes = await childProcessAsync.spawn(
        "docker",
        [ "exec", cid, "wc", "-c", norm ],
        { encoding: "utf-8" }
    );
    const sizeMatch = (sizeRes.stdout?.toString() ?? "").trim().match(/^(\d+)/);
    const size = sizeMatch ? parseInt(sizeMatch[1], 10) : NaN;
    if (!isNaN(size) && size > MAX_FILE_SIZE) {
        throw new Error(`Fichier trop volumineux (${Math.round(size / 1024)} Kio, max ${MAX_FILE_SIZE / 1024} Kio)`);
    }

    // Contenu (buffer brut pour détecter le binaire)
    const res = await childProcessAsync.spawn(
        "docker",
        [ "exec", cid, "cat", norm ],
        { encoding: "buffer", maxBuffer: MAX_FILE_SIZE + 1024 }
    );
    const buf: Buffer = Buffer.isBuffer(res.stdout) ? res.stdout : Buffer.from(res.stdout ?? "");
    if (buf.includes(0)) {
        throw new Error("Fichier binaire — édition non supportée");
    }
    return buf.toString("utf-8");
}

/** Écrit le contenu dans un fichier (truncate en place : conserve owner/perms). */
export async function writeFile(server: DockgeServer, stackName: string, service: string, filePath: string, content: string): Promise<void> {
    if (typeof content !== "string") {
        throw new Error("Contenu invalide");
    }
    if (Buffer.byteLength(content, "utf-8") > MAX_FILE_SIZE) {
        throw new Error(`Contenu trop volumineux (max ${MAX_FILE_SIZE / 1024} Kio)`);
    }
    const { cid, mounts } = await prepare(server, stackName, service);
    const norm = assertWithinMounts(filePath, mounts);

    await new Promise<void>((resolve, reject) => {
        // `cat > fichier` tronque le fichier existant en place : son inode,
        // son propriétaire et ses permissions sont préservés.
        const proc = spawn("docker", [ "exec", "-i", cid, "sh", "-c", `cat > ${shQuote(norm)}` ]);
        let err = "";
        proc.stderr.on("data", (d) => (err += d.toString()));
        proc.on("error", reject);
        proc.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(err.trim() || `Échec de l'écriture (code ${code})`));
            }
        });
        proc.stdin.write(content);
        proc.stdin.end();
    });
}
