import { Knex } from "knex";
export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("host_inventory", table => {
        table.string("fingerprint", 64).primary();
        table.text("report").notNullable();
        table.bigInteger("last_seen").notNullable();
    });
    await knex.schema.createTable("host_history", table => {
        table.increments("id").primary();
        table.bigInteger("collected_at").notNullable().unique();
        table.string("fingerprint", 64).notNullable();
        table.text("summary").notNullable();
        table.index([ "fingerprint" ]);
    });
}
export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("host_history");
    await knex.schema.dropTableIfExists("host_inventory");
}
