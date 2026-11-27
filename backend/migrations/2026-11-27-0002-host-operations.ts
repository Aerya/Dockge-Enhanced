import { Knex } from "knex";
export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("host_operations", table => {
        table.string("event_key", 160).primary();
        table.bigInteger("at").notNullable();
        table.text("event").notNullable();
        table.boolean("notified").notNullable().defaultTo(false);
        table.boolean("audited").notNullable().defaultTo(false);
    });
}
export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("host_operations");
}
