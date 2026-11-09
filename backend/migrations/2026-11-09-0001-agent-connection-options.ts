import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("agent", table => {
        table.text("connection_options").nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable("agent", table => {
        table.dropColumn("connection_options");
    });
}
