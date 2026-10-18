import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("user", table => {
        table.text("twofa_secret_encrypted").nullable();
        table.text("twofa_recovery_hashes").nullable();
        table.bigInteger("twofa_last_counter").notNullable().defaultTo(-1);
        table.integer("twofa_version").notNullable().defaultTo(0);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable("user", table => {
        table.dropColumns("twofa_secret_encrypted", "twofa_recovery_hashes", "twofa_last_counter", "twofa_version");
    });
}
