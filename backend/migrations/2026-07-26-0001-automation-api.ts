import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("automation_token", (table) => {
        table.increments("id");
        table.string("name", 120).notNullable();
        table.string("prefix", 24).notNullable().unique();
        table.string("secret_hash", 64).notNullable().unique();
        table.text("permissions").notNullable();
        table.text("stacks").notNullable();
        table.string("created_at", 50).notNullable().index();
        table.string("expires_at", 50).nullable().index();
        table.string("last_used_at", 50).nullable();
        table.string("revoked_at", 50).nullable().index();
    });

    await knex.schema.createTable("automation_webhook", (table) => {
        table.increments("id");
        table.string("name", 120).notNullable();
        table.string("prefix", 24).notNullable();
        table.string("secret_hash", 64).notNullable().unique();
        table.string("stack_name", 255).notNullable().index();
        table.text("actions").notNullable();
        table.boolean("enabled").notNullable().defaultTo(true).index();
        table.integer("rate_limit_per_minute").notNullable().defaultTo(10);
        table.string("created_at", 50).notNullable().index();
        table.string("expires_at", 50).nullable().index();
        table.string("last_used_at", 50).nullable();
        table.string("rotated_at", 50).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("automation_webhook");
    await knex.schema.dropTableIfExists("automation_token");
}
