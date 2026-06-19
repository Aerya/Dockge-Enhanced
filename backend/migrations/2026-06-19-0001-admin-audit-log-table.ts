import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable("admin_audit_log", (table) => {
        table.increments("id");
        table.string("timestamp", 50).notNullable().index();
        table.integer("user_id").nullable().index();
        table.string("username", 255).nullable().index();
        table.string("action", 120).notNullable().index();
        table.string("category", 80).notNullable().index();
        table.string("target_type", 80).nullable().index();
        table.string("target", 500).nullable().index();
        table.string("status", 20).notNullable().defaultTo("success").index();
        table.text("message").nullable();
        table.text("metadata").nullable();
        table.string("ip", 100).nullable();
        table.string("endpoint", 255).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTable("admin_audit_log");
}
