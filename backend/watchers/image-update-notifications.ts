import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { atomicWriteJson } from "../self-update/state-file";

interface UpdateNotice {
    stack: string;
    image: string;
    remoteDigest: string;
}

type NotificationReceipts = Record<string, Record<string, string>>;

/** Successful pending-update announcements, independently tracked per destination. */
export class ImageUpdateNotifications {
    private receipts: NotificationReceipts | undefined;
    private tail: Promise<void> = Promise.resolve();

    constructor(private readonly file: string) {}

    async dispatch<T extends UpdateNotice>(
        destination: readonly string[],
        updates: T[],
        applied: T[],
        send: (updates: T[]) => Promise<boolean>,
    ): Promise<void> {
        // Reserve the queue synchronously, before loading state or sending over HTTP.
        const operation = this.tail.then(async () => {
            const receipts = await this.load();
            // Do not persist webhook tokens or Apprise credentials in the ledger.
            const channel = createHash("sha256").update(JSON.stringify(destination)).digest("hex");
            const previous = receipts[channel] ?? {};
            const key = (update: T) => `${update.stack}::${update.image}`;
            const appliedKeys = new Set(applied.map(key));
            const selected = updates.filter(update => appliedKeys.has(key(update)) || (
                update.remoteDigest.trim() && previous[key(update)] !== update.remoteDigest
            ));
            if (selected.length === 0 || !await send(selected)) {
                return;
            }
            const next = { ...previous };
            for (const update of selected) {
                if (appliedKeys.has(key(update))) {
                    delete next[key(update)];
                } else {
                    next[key(update)] = update.remoteDigest;
                }
            }
            const saved = { ...receipts,
                [channel]: next };
            await atomicWriteJson(this.file, saved);
            this.receipts = saved;
        });
        this.tail = operation.catch(() => {});
        await operation;
    }

    private async load(): Promise<NotificationReceipts> {
        if (this.receipts) {
            return this.receipts;
        }
        try {
            const parsed: unknown = JSON.parse(await readFile(this.file, "utf8"));
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                throw new Error("Invalid image notification receipts");
            }
            const receipts: NotificationReceipts = {};
            for (const [ channel, entries ] of Object.entries(parsed)) {
                if (!/^[a-f0-9]{64}$/.test(channel) || !entries || typeof entries !== "object" || Array.isArray(entries)) {
                    continue;
                }
                receipts[channel] = Object.fromEntries(Object.entries(entries).filter(
                    (entry): entry is [string, string] => entry[0].includes("::") && typeof entry[1] === "string" && entry[1].trim().length > 0,
                ));
            }
            this.receipts = receipts;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                throw error;
            }
            this.receipts = {};
        }
        return this.receipts;
    }
}
