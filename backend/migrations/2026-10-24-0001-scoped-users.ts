import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("user", table => {
        table.string("role").notNullable().defaultTo("admin");
        table.text("stack_grants").notNullable().defaultTo("[]");
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable("user", table => table.dropColumns("role", "stack_grants"));
}
