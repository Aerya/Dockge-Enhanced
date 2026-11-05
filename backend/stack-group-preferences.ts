import type { Knex } from "knex";
import { isDeepStrictEqual } from "node:util";
import { parseStackGroups, type StackGroupPreferences } from "../common/stack-groups";

export interface StoredStackGroups {
    revision: number;
    preferences: StackGroupPreferences;
}

/** Display preferences only: never used as an authorization source. */
export class StackGroupPreferencesStore {
    constructor(private db: Knex) {}

    async load(userId: number): Promise<StoredStackGroups> {
        const row = await this.db("stack_group_preferences").where({ user_id: userId }).first();
        return { revision: row?.revision ?? 0,
            preferences: parseStackGroups(row?.preferences ?? null) };
    }

    async save(userId: number, input: unknown): Promise<StoredStackGroups> {
        if (!input || typeof input !== "object") {
            throw new Error("stackGroups.invalid");
        }
        const value = input as StoredStackGroups;
        if (!Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision >= Number.MAX_SAFE_INTEGER
            || !value.preferences || typeof value.preferences !== "object") {
            throw new Error("stackGroups.invalid");
        }
        const raw = JSON.stringify(value.preferences);
        if (Buffer.byteLength(raw) > 256 * 1024) {
            throw new Error("stackGroups.invalid");
        }
        const preferences = parseStackGroups(raw);
        // Reject malformed/truncated input instead of silently losing groups.
        if (!isDeepStrictEqual(preferences, value.preferences)) {
            throw new Error("stackGroups.invalid");
        }
        await this.db("stack_group_preferences").insert({ user_id: userId,
            revision: 0,
            preferences: JSON.stringify(parseStackGroups(null)) }).onConflict("user_id").ignore();
        // Atomic compare-and-swap in the database, including concurrent processes.
        const updated = await this.db("stack_group_preferences").where({ user_id: userId,
            revision: value.revision }).update({ revision: value.revision + 1,
            preferences: JSON.stringify(preferences) });
        if (!updated) {
            throw new Error("stackGroups.conflict");
        }
        return { revision: value.revision + 1,
            preferences };
    }
}
