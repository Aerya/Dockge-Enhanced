import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const MAX_FILE = 2 * 1024 * 1024;
type Files = Record<string, string | null>;
interface Revision { id: string;
    date: string;
    reason: string;
    files: Files }

/** Local encrypted file revisions, independent of full application backups. */
export class StackFileHistory {
    private directory: string;
    constructor(private dataDir: string, private project: string) {
        this.directory = path.join(dataDir, "stack-file-history", createHash("sha256").update(project).digest("hex"));
    }

    private async key(create = false): Promise<Buffer> {
        const filename = path.join(this.dataDir, "stack-file-history.key");
        try {
            const existing = await fs.readFile(filename);
            if (existing.length !== 32) {
                throw new Error("configTools.historyUnavailable");
            }
            return existing;
        } catch (error) {
            if (!create || (error as NodeJS.ErrnoException).code !== "ENOENT") {
                throw new Error("configTools.historyUnavailable", { cause: error });
            }
        }
        const temporary = filename + "." + randomUUID();
        try {
            await fs.writeFile(temporary, randomBytes(32), { flag: "wx",
                mode: 0o600 });
            await fs.link(temporary, filename);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                throw error;
            }
        } finally {
            await fs.rm(temporary, { force: true });
        }
        const key = await fs.readFile(filename);
        if (key.length !== 32) {
            throw new Error("configTools.historyUnavailable");
        }
        return key;
    }

    async readFiles(paths: Record<string, string>): Promise<Files> {
        const files: Files = {};
        for (const [ name, filename ] of Object.entries(paths)) {
            try {
                const stat = await fs.stat(filename);
                if (!stat.isFile() || stat.size > MAX_FILE) {
                    throw new Error("configTools.historyUnavailable");
                }
                files[name] = await fs.readFile(filename, "utf8");
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                    throw error;
                }
                files[name] = null;
            }
        }
        return files;
    }

    async capture(paths: Record<string, string>, reason: string): Promise<void> {
        const files = await this.readFiles(paths);
        if (Object.values(files).every(value => value === null)) {
            return;
        }
        await fs.mkdir(this.directory, { recursive: true,
            mode: 0o700 });
        const entries = await this.list();
        if (entries[0] && JSON.stringify((await this.get(entries[0].id)).files) === JSON.stringify(files)) {
            return;
        }
        const timestamp = Math.max(Date.now(), entries[0] ? Date.parse(entries[0].date) + 1 : 0);
        const revision: Revision = { id: randomUUID(),
            date: new Date(timestamp).toISOString(),
            reason,
            files };
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", await this.key(true), iv);
        cipher.setAAD(Buffer.from(this.project));
        const payload = Buffer.concat([ cipher.update(JSON.stringify(revision), "utf8"), cipher.final() ]);
        const temporary = path.join(this.directory, revision.id + ".tmp");
        try {
            await fs.writeFile(temporary, JSON.stringify({ iv: iv.toString("base64"),
                tag: cipher.getAuthTag().toString("base64"),
                payload: payload.toString("base64") }), { flag: "wx",
                mode: 0o600 });
            await fs.rename(temporary, path.join(this.directory, revision.id + ".json"));
        } finally {
            await fs.rm(temporary, { force: true });
        }
        for (const entry of (await this.list()).slice(20)) {
            await fs.unlink(path.join(this.directory, entry.id + ".json"));
        }
    }

    async get(id: string): Promise<Revision> {
        if (!/^[a-f0-9-]{36}$/.test(id)) {
            throw new Error("configTools.historyUnavailable");
        }
        const sealed = JSON.parse(await fs.readFile(path.join(this.directory, id + ".json"), "utf8"));
        const decipher = createDecipheriv("aes-256-gcm", await this.key(), Buffer.from(sealed.iv, "base64"));
        decipher.setAAD(Buffer.from(this.project));
        decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
        return JSON.parse(Buffer.concat([ decipher.update(Buffer.from(sealed.payload, "base64")), decipher.final() ]).toString("utf8")) as Revision;
    }

    async list(): Promise<Omit<Revision, "files">[]> {
        let names: string[];
        try {
            names = await fs.readdir(this.directory);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return [];
            }
            throw error;
        }
        const entries = await Promise.all(names.filter(name => /^[a-f0-9-]{36}\.json$/.test(name)).map(async name => {
            const { id, date, reason } = await this.get(name.slice(0, -5));
            return { id,
                date,
                reason };
        }));
        return entries.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    }

    /** Restore exact known files only; never take filesystem paths from a revision. */
    async restore(paths: Record<string, string>, id: string): Promise<void> {
        const revision = await this.get(id);
        if (Object.keys(revision.files).sort().join("\n") !== Object.keys(paths).sort().join("\n")) {
            throw new Error("configTools.filesChanged");
        }
        const previous = await this.readFiles(paths);
        await this.capture(paths, "restore");
        const write = async (files: Files) => {
            for (const [ name, filename ] of Object.entries(paths)) {
                const text = files[name];
                if (text === null) {
                    await fs.rm(filename, { force: true });
                } else {
                    await fs.writeFile(filename, text, { mode: 0o600 });
                }
            }
        };
        try {
            await write(revision.files);
        } catch (error) {
            await write(previous);
            throw error;
        }
    }
}
