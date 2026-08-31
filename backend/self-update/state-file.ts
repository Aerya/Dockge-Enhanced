import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function atomicWriteFile(file: string, data: string | Buffer, mode = 0o600): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`);
    let handle;
    try {
        handle = await fs.open(temporary, "wx", mode);
        await handle.writeFile(data);
        await handle.sync();
        await handle.close();
        handle = undefined;
        await fs.rename(temporary, file);
        await fs.chmod(file, mode);
    } catch (error) {
        await handle?.close().catch(() => undefined);
        await fs.unlink(temporary).catch(() => undefined);
        throw error;
    }
}

export async function atomicWriteJson(file: string, value: unknown): Promise<void> {
    await atomicWriteFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
