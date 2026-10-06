import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("monitoring_history", (table) => {
        table.increments("id").primary();
        table.timestamp("sampled_at").notNullable();
        table.float("cpu_percent").notNullable();
        table.float("ram_percent").notNullable();
        table.bigInteger("ram_used").notNullable();
        table.bigInteger("ram_total").notNullable();
        table.index([ "sampled_at" ], "monitoring_history_sampled_at_idx");
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("monitoring_history");
}
