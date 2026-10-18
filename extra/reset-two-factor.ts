import { Database } from "../backend/database";
import { resolveDataDir } from "../backend/data-dir";
import { R } from "redbean-node";
import { existsSync } from "node:fs";
import path from "node:path";

// Local administrative recovery only: no unauthenticated reset API is exposed.
const args = process.argv.slice(2);
if (args.length !== 3 || args[0] !== "--username" || !args[1] || args[2] !== "--confirm") {
    console.error("Usage: ./node_modules/.bin/tsx ./extra/reset-two-factor.ts --username ACCOUNT --confirm");
    process.exitCode = 1;
} else {
    try {
        // Recovery must not construct HTTP routers, watchers or parse server arguments.
        const dataDir = resolveDataDir();
        if (!existsSync(path.join(dataDir, "dockge.db"))) {
            throw new Error("Existing database required.");
        }
        await Database.init({ config: { dataDir } }, false);
        const changed = await R.knex("user").where({ username: args[1],
            active: 1 }).update({
            twofa_status: 0,
            twofa_secret: null,
            twofa_secret_encrypted: null,
            twofa_recovery_hashes: null,
            twofa_last_counter: -1,
            twofa_last_token: null,
            twofa_version: R.knex.raw("twofa_version + 1"),
        });
        if (changed !== 1) {
            throw new Error("Account not found.");
        }
        console.log("2FA disabled. Restart Enhanced to disconnect all existing sockets. The account password is unchanged.");
    } catch {
        console.error("2FA reset failed. Check the account name and access to the application data directory.");
        process.exitCode = 1;
    } finally {
        if (R.knex) {
            await Database.close();
        }
    }
}
