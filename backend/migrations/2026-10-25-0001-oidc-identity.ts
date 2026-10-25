import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("user", table => {
        table.string("oidc_issuer", 255).nullable();
        table.string("oidc_subject", 255).nullable();
        table.unique([ "oidc_issuer", "oidc_subject" ], { indexName: "user_oidc_identity_unique" });
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable("user", table => {
        table.dropUnique([ "oidc_issuer", "oidc_subject" ], "user_oidc_identity_unique");
        table.dropColumns("oidc_issuer", "oidc_subject");
    });
}
