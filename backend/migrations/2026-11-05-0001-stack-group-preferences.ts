import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("stack_group_preferences", table => {
        table.integer("user_id").primary().references("id").inTable("user").onDelete("CASCADE");
        table.integer("revision").notNullable().defaultTo(0);
        table.text("preferences").notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable("stack_group_preferences");
}
