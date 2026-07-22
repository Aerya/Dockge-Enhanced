import { ValidationError } from "../util-server";

export type ApplicationProfileId = "custom" | "postgresql" | "mysql" | "redis" | "sqlite";

export interface ApplicationProfile {
    id: Exclude<ApplicationProfileId, "custom">;
    preHook: string;
    postHook: string;
    description: string;
}

export const APPLICATION_PROFILES: ApplicationProfile[] = [
    { id: "postgresql",
        preHook: "pg_dumpall --clean --if-exists > /tmp/dockge-transfer-postgresql.sql && test -s /tmp/dockge-transfer-postgresql.sql",
        postHook: "rm -f /tmp/dockge-transfer-postgresql.sql",
        description: "Creates and validates a PostgreSQL logical dump before the snapshot." },
    { id: "mysql",
        preHook: "(mariadb-dump --all-databases --single-transaction || mysqldump --all-databases --single-transaction) > /tmp/dockge-transfer-mysql.sql && test -s /tmp/dockge-transfer-mysql.sql",
        postHook: "rm -f /tmp/dockge-transfer-mysql.sql",
        description: "Creates a transactionally consistent MariaDB or MySQL logical dump." },
    { id: "redis",
        preHook: "redis-cli BGSAVE && while redis-cli INFO persistence | grep -q 'rdb_bgsave_in_progress:1'; do sleep 1; done",
        postHook: "true",
        description: "Requests a Redis background save and waits for persistence to settle." },
    { id: "sqlite",
        preHook: "db=${DOCKGE_SQLITE_PATH:?Set DOCKGE_SQLITE_PATH}; sqlite3 \"$db\" 'PRAGMA wal_checkpoint(TRUNCATE);' && sqlite3 \"$db\" \".backup '/tmp/dockge-transfer.sqlite'\" && test -s /tmp/dockge-transfer.sqlite",
        postHook: "rm -f /tmp/dockge-transfer.sqlite",
        description: "Checkpoints the SQLite WAL and creates a consistent online backup." },
];

export function getApplicationProfile(value: unknown): ApplicationProfile | undefined {
    if (value === undefined || value === "" || value === "custom") {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new ValidationError("Invalid application profile");
    }
    const profile = APPLICATION_PROFILES.find(item => item.id === value);
    if (!profile) {
        throw new ValidationError("Unknown application profile");
    }
    return profile;
}
