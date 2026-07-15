import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("agent", (table) => {
        table.string("display_name", 100).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable("agent", (table) => {
        table.dropColumn("display_name");
    });
}
