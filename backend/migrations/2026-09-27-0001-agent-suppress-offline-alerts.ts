import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("agent", (table) => {
        table.boolean("suppress_offline_alerts").notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable("agent", (table) => {
        table.dropColumn("suppress_offline_alerts");
    });
}
