/**
 * Navigateur/éditeur de fichiers de volumes.
 *
 * Approche : un conteneur helper busybox éphémère monte le volume concerné et
 * exécute l'opération (ls/cat/mkdir/mv/rm/écriture). Avantages :
 *   - fonctionne que le conteneur du service soit démarré OU arrêté (stopped) ;
 *   - fonctionne même si l'image du service n'a pas de shell (distroless/scratch) ;
 *   - le backend Dockge n'a pas besoin de voir le chemin hôte (tout passe par le
 *     socket Docker).
 *
 * Le chemin hôte (binds) ou le nom (volumes nommés) est obtenu via `docker
 * inspect` du conteneur du service (qui doit exister — stopped est suffisant).
 *
 * Sécurité : chaque opération est restreinte aux points de montage déclarés du
 * conteneur ; le helper ne monte que le volume ciblé sur /mnt, sans réseau.
 */
import { Stack } from "./stack";
import { DockgeServer } from "./dockge-server";
import childProcessAsync from "promisify-child-process";
import { spawn } from "child_process";
import path from "path";
import { log } from "./log";

const HELPER_IMAGE = process.env.DOCKGE_VOLUME_HELPER_IMAGE || "busybox:stable";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mio — limite éditeur texte
const MAX_ENTRIES = 5000;

let helperImageReady = false;

export interface VolumeMount {
    type: string;        // bind | volume
    source: string;      // chemin hôte (bind) ou mountpoint
    name: string;        // nom du volume (volumes nommés)
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

/** Valide un nom de fichier/dossier simple (pas de séparateur ni de ..). */
function assertSimpleName(name: string): string {
    if (typeof name !== "string" || name.trim() === "") {
        throw new Error("Nom invalide");
    }
    if (name === "." || name === ".." || /[/\\\0]/.test(name)) {
        throw new Error("Nom invalide");
    }
    return name;
}

/** S'assure que l'image helper est disponible (pull au premier usage). */
async function ensureHelperImage(): Promise<void> {
    if (helperImageReady) {
        return;
    }
    try {
        await childProcessAsync.spawn("docker", [ "image", "inspect", HELPER_IMAGE ], { encoding: "utf-8" });
    } catch {
        log.info("volume-files", `Téléchargement de l'image helper ${HELPER_IMAGE}…`);
        await childProcessAsync.spawn("docker", [ "pull", HELPER_IMAGE ], { encoding: "utf-8", timeout: 120000 });
    }
    helperImageReady = true;
}

/** Résout l'ID du conteneur du service (inclut les conteneurs arrêtés). */
async function resolveContainerId(server: DockgeServer, stackName: string, service: string): Promise<string> {
    const stack = await Stack.getStack(server, stackName);
    const res = await childProcessAsync.spawn(
        "docker",
        stack.getComposeOptions("ps", "-a", "-q", service),
        { cwd: stack.path, encoding: "utf-8" }
    );
    const id = (res.stdout?.toString() ?? "").trim().split("\n")[0].trim();
    if (!id) {
        throw new Error("Conteneur introuvable (stack jamais déployée ou supprimée)");
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
            source: String(m.Source ?? ""),
            name: String(m.Name ?? ""),
            destination: String(m.Destination ?? ""),
            rw: m.RW !== false,
        }))
        .filter((m) => m.type === "bind" || m.type === "volume");
}

/** Prépare la liste des montages du conteneur. */
async function prepare(server: DockgeServer, stackName: string, service: string): Promise<VolumeMount[]> {
    const cid = await resolveContainerId(server, stackName, service);
    return inspectMounts(cid);
}

/** Trouve le montage contenant le chemin demandé et le chemin relatif associé. */
function resolveMount(reqPath: string, mounts: VolumeMount[]): { mount: VolumeMount; rel: string } {
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
            const rel = norm.slice(dest.length).replace(/^\/+/, "");
            return { mount: m, rel };
        }
    }
    throw new Error("Chemin hors des volumes du conteneur");
}

/** Source à monter dans le helper : nom pour un volume nommé, chemin pour un bind. */
function helperSource(mount: VolumeMount): string {
    if (mount.type === "volume" && mount.name) {
        return mount.name;
    }
    return mount.source;
}

/** Construit le chemin dans le helper (/mnt/<rel>) en empêchant toute évasion. */
function mntJoin(rel: string): string {
    const p = path.posix.normalize("/mnt/" + (rel ?? ""));
    if (p !== "/mnt" && !p.startsWith("/mnt/")) {
        throw new Error("Chemin invalide");
    }
    return p;
}

interface HelperOpts {
    rw?: boolean;
    input?: Buffer | string;
    encoding?: "utf-8" | "buffer";
}

/** Exécute une commande dans le helper busybox montant le volume ciblé. */
async function helperRun(mount: VolumeMount, argv: string[], opts: HelperOpts = {}): Promise<Buffer> {
    await ensureHelperImage();
    const src = helperSource(mount);
    if (!src) {
        throw new Error("Volume non résolu");
    }
    const mode = opts.rw ? "" : ":ro";
    const dockerArgs = [
        "run", "--rm", "--network", "none",
        ...(opts.input !== undefined ? [ "-i" ] : []),
        "-v", `${src}:/mnt${mode}`,
        HELPER_IMAGE,
        ...argv,
    ];

    if (opts.input === undefined) {
        const res = await childProcessAsync.spawn("docker", dockerArgs, {
            encoding: "buffer",
            maxBuffer: MAX_FILE_SIZE + 64 * 1024,
        });
        return Buffer.isBuffer(res.stdout) ? res.stdout : Buffer.from(res.stdout ?? "");
    }

    // Avec entrée standard (écriture)
    return await new Promise<Buffer>((resolve, reject) => {
        const proc = spawn("docker", dockerArgs);
        const chunks: Buffer[] = [];
        let err = "";
        proc.stdout.on("data", (d) => chunks.push(Buffer.from(d)));
        proc.stderr.on("data", (d) => (err += d.toString()));
        proc.on("error", reject);
        proc.on("close", (code) => {
            if (code === 0) {
                resolve(Buffer.concat(chunks));
            } else {
                reject(new Error(err.trim() || `Échec de l'opération (code ${code})`));
            }
        });
        proc.stdin.on("error", () => { /* EPIPE si le helper se ferme tôt */ });
        proc.stdin.write(opts.input);
        proc.stdin.end();
    });
}

/** Retourne les montages éditables du service. */
export async function getVolumeMounts(server: DockgeServer, stackName: string, service: string): Promise<VolumeMount[]> {
    return prepare(server, stackName, service);
}

/** Liste le contenu d'un répertoire (dossiers d'abord, puis fichiers). */
export async function listDir(server: DockgeServer, stackName: string, service: string, dirPath: string): Promise<DirEntry[]> {
    const mounts = await prepare(server, stackName, service);
    const { mount, rel } = resolveMount(dirPath, mounts);

    const out = await helperRun(mount, [ "ls", "-1Ap", "--", mntJoin(rel) ], {});
    const lines = out.toString("utf-8")
        .split("\n")
        .map((l) => l.replace(/\r$/, ""))
        .filter((l) => l.length > 0)
        .slice(0, MAX_ENTRIES);

    const entries: DirEntry[] = [];
    for (const line of lines) {
        if (line.endsWith("/")) {
            entries.push({ name: line.slice(0, -1), type: "dir" });
        } else {
            entries.push({ name: line.replace(/[*=|@]$/, ""), type: "file" });
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
    const mounts = await prepare(server, stackName, service);
    const { mount, rel } = resolveMount(filePath, mounts);

    let buf: Buffer;
    try {
        buf = await helperRun(mount, [ "cat", "--", mntJoin(rel) ], { encoding: "buffer" });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/maxBuffer/i.test(msg)) {
            throw new Error(`Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} Mio)`);
        }
        throw e;
    }
    if (buf.length > MAX_FILE_SIZE) {
        throw new Error(`Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} Mio)`);
    }
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
        throw new Error(`Contenu trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} Mio)`);
    }
    const mounts = await prepare(server, stackName, service);
    const { mount, rel } = resolveMount(filePath, mounts);
    // `cat > fichier` tronque en place : inode/owner/permissions préservés.
    await helperRun(mount, [ "sh", "-c", `cat > ${shQuote(mntJoin(rel))}` ], { rw: true, input: content });
}

/** Crée un fichier vide ou un dossier dans un répertoire. */
export async function createEntry(server: DockgeServer, stackName: string, service: string, dirPath: string, name: string, kind: "file" | "dir"): Promise<void> {
    assertSimpleName(name);
    const mounts = await prepare(server, stackName, service);
    const { mount, rel } = resolveMount(dirPath, mounts);
    const target = mntJoin(rel ? `${rel}/${name}` : name);
    const q = shQuote(target);

    if (kind === "dir") {
        await helperRun(mount, [ "mkdir", "--", target ], { rw: true });
    } else {
        await helperRun(mount, [ "sh", "-c", `if [ -e ${q} ]; then echo "existe déjà" >&2; exit 1; fi; : > ${q}` ], { rw: true });
    }
}

/** Renomme un fichier/dossier dans son répertoire. */
export async function renameEntry(server: DockgeServer, stackName: string, service: string, targetPath: string, newName: string): Promise<void> {
    assertSimpleName(newName);
    const mounts = await prepare(server, stackName, service);
    const { mount, rel } = resolveMount(targetPath, mounts);
    if (rel === "") {
        throw new Error("Impossible de renommer la racine du volume");
    }
    const parent = path.posix.dirname(rel);
    const newRel = parent === "." ? newName : `${parent}/${newName}`;
    await helperRun(mount, [ "mv", "--", mntJoin(rel), mntJoin(newRel) ], { rw: true });
}

/** Supprime un fichier ou un dossier (récursif). */
export async function removeEntry(server: DockgeServer, stackName: string, service: string, targetPath: string): Promise<void> {
    const mounts = await prepare(server, stackName, service);
    const { mount, rel } = resolveMount(targetPath, mounts);
    if (rel === "") {
        throw new Error("Impossible de supprimer la racine du volume");
    }
    await helperRun(mount, [ "rm", "-rf", "--", mntJoin(rel) ], { rw: true });
}

/** Téléverse un fichier (contenu base64) dans un répertoire. */
export async function uploadFile(server: DockgeServer, stackName: string, service: string, dirPath: string, name: string, base64: string): Promise<void> {
    assertSimpleName(name);
    if (typeof base64 !== "string") {
        throw new Error("Contenu invalide");
    }
    const buf = Buffer.from(base64, "base64");
    if (buf.length > MAX_FILE_SIZE) {
        throw new Error(`Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} Mio)`);
    }
    const mounts = await prepare(server, stackName, service);
    const { mount, rel } = resolveMount(dirPath, mounts);
    const target = mntJoin(rel ? `${rel}/${name}` : name);
    await helperRun(mount, [ "sh", "-c", `cat > ${shQuote(target)}` ], { rw: true, input: buf });
}
