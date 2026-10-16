import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("container_resource_history", table => {
        table.increments("id").primary();
        table.string("stack_name", 200).notNullable();
        table.string("container_id", 64).notNullable();
        table.string("container_name", 255).notNullable();
        table.string("service_name", 200).notNullable();
        table.timestamp("sampled_at").notNullable();
        table.float("cpu_percent").notNullable();
        table.bigInteger("mem_used").notNullable();
        table.unique([ "container_id", "sampled_at" ], "container_resource_history_id_time_idx");
        table.index([ "stack_name", "sampled_at" ], "container_resource_history_stack_time_idx");
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("container_resource_history");
}
