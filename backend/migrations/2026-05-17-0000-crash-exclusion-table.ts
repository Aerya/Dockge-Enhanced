import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable("crash_exclusion", (table) => {
        table.increments("id");
        table.string("container_name", 500).notNullable().unique();
        table.string("expires_at", 50).nullable(); // ISO date, ou NULL = permanent
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTable("crash_exclusion");
}
