import path from "node:path";
import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { acceptedComposeFileNames } from "../common/util-common";

/** Keep Compose's own discovery (.env, COMPOSE_FILE and default overrides). */
export function composeInvocation(composePath: string, args: string[], project?: string, configFiles?: string[], workingDir?: string, envFiles?: string[], relativeFiles = true) {
    const cwd = path.resolve(workingDir ?? path.dirname(composePath));
    const files = configFiles?.length ? configFiles :
        acceptedComposeFileNames.includes(path.basename(composePath)) ? [] : [ composePath ];
    return {
        args: [
            "compose",
            ...(workingDir ? [ "--project-directory", cwd ] : []),
            ...(project ? [ "--project-name", project ] : []),
            ...(envFiles ?? []).flatMap(file => [ "--env-file", path.resolve(file) ]),
            ...files.flatMap(file => {
                const resolved = path.resolve(file);
                return [ "-f", relativeFiles && path.dirname(resolved) === cwd ? path.basename(resolved) : resolved ];
            }),
            ...args,
        ],
        cwd,
    };
}

/** Native stacks inherit global.env before their local .env; externals opt out. */
export function managedComposeEnvFiles(stacksDir: string, cwd: string): string[] {
    const global = path.resolve(stacksDir, "global.env");
    if (!fs.existsSync(global)) {
        return [];
    }
    const local = path.resolve(cwd, ".env");
    return [ global, ...(fs.existsSync(local) ? [ local ] : []) ];
}

/** Adding -f disables discovery: materialize and verify the original chain first. */
export async function composePrefixWithOverride(
    prefix: string[], cwd: string, override: string,
    run: (args: string[], timeout: number) => Promise<string>,
): Promise<string[]> {
    let explicit = prefix;
    if (!prefix.includes("-f") && !prefix.includes("--file")) {
        // Compose resolves interpolation, COMPOSE_ENV_FILES and both .env layers.
        // Never log this output: it can contain secrets.
        const environment = await run([ ...prefix, "config", "--environment" ], 30_000);
        const value = (key: string) => environment.split(/\r?\n/).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1);
        const configured = value("COMPOSE_FILE");
        let files: string[];
        if (configured) {
            files = configured.split(value("COMPOSE_PATH_SEPARATOR") || path.delimiter);
        } else {
            const base = [ "compose.yaml", "compose.yml", "docker-compose.yml", "docker-compose.yaml" ].find(file => fs.existsSync(path.join(cwd, file)));
            const extra = [ "compose.override.yml", "compose.override.yaml", "docker-compose.override.yml", "docker-compose.override.yaml" ].find(file => fs.existsSync(path.join(cwd, file)));
            if (!base) {
                throw new Error("Compose file chain unavailable for rollout");
            }
            files = [ base, ...(extra ? [ extra ] : []) ];
        }
        explicit = [ ...prefix, ...files.flatMap(file => [ "-f", path.resolve(cwd, file) ]) ];
        const expected = JSON.parse(await run([ ...prefix, "config", "--format", "json" ], 30_000));
        const actual = JSON.parse(await run([ ...explicit, "config", "--format", "json" ], 30_000));
        if (!isDeepStrictEqual(expected, actual)) {
            throw new Error("Compose file chain differs; refusing rollout override");
        }
    }
    const base = explicit.filter((arg, index) =>
        !(arg === "-f" && explicit[index + 1] === override) && !(arg === override && explicit[index - 1] === "-f"));
    return [ ...base, "-f", override ];
}
