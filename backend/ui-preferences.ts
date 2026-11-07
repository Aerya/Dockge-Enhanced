import type { Knex } from "knex";
import { defaultUiPreferences, validateUiPreferences } from "../common/ui-preferences";

export class UiPreferencesStore {
    constructor(private db: Knex) {}
    async load(userId: number) {
        const row = await this.db("ui_preferences").where({ user_id: userId }).first();
        return { revision: row?.revision ?? 0,
            preferences: row ? validateUiPreferences(JSON.parse(row.preferences)) : defaultUiPreferences() };
    }

    async save(userId: number, input: unknown) {
        const value = input as { revision: number;
            preferences: unknown } | null;
        if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision >= Number.MAX_SAFE_INTEGER) {
            throw new Error("uiPreferences.invalid");
        }
        const preferences = validateUiPreferences(value.preferences);
        await this.db("ui_preferences").insert({ user_id: userId,
            revision: 0,
            preferences: JSON.stringify(defaultUiPreferences()) }).onConflict("user_id").ignore();
        const updated = await this.db("ui_preferences").where({ user_id: userId,
            revision: value.revision })
            .update({ revision: value.revision + 1,
                preferences: JSON.stringify(preferences) });
        if (!updated) {
            throw new Error("uiPreferences.conflict");
        }
        return { revision: value.revision + 1,
            preferences };
    }
}
