import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("stack_resource_history", table => {
        table.increments("id").primary();
        table.string("stack_name", 200).notNullable();
        table.timestamp("sampled_at").notNullable();
        table.float("cpu_percent").notNullable();
        table.bigInteger("mem_used").notNullable();
        table.unique([ "stack_name", "sampled_at" ], "stack_resource_history_stack_time_idx");
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("stack_resource_history");
}
