import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { configureSecrets, type Binding, type Connection } from "./store";
import { secretEnvironment, resolveSecrets, bitwardenProfile } from "./providers";
import { secretContext, secretStackPs, prepareSecrets, withSecretOperation } from "./runtime";
import buffered, { execFile } from "../buffered-process";

const connection: Connection = { id: "",
    name: "Test",
    provider: "doppler",
    url: "",
    token: "fixture-provider-token",
    clientId: "" };
const binding: Binding = { connection: "",
    project: "test",
    environment: "dev",
    secretPath: "/" };
async function fixture(t: TestContext) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-secrets-test-"));
    const cwd = path.join(directory, "stack");
    await fs.mkdir(cwd);
    const store = configureSecrets(directory);
    await store.save(connection);
    const selected = { ...binding,
        connection: store.list()[0].id };
    await store.bind(cwd, selected);
    t.after(async () => {
        configureSecrets(path.join(directory, "unused"));
        await fs.rm(directory, { recursive: true,
            force: true });
    });
    return { store,
        directory,
        cwd,
        selected };
}
test("credentials are encrypted, omitted from responses and fail closed after key loss", async t => {
    const { store, directory, cwd, selected } = await fixture(t);
    const onDisk = await fs.readFile(path.join(directory, "stack-secrets.json"), "utf8");
    assert.ok(!onDisk.includes(connection.token));
    assert.ok(!JSON.stringify(store.list()).includes(connection.token));
    assert.equal((await store.connection(selected.connection)).token, connection.token);
    assert.equal((await fs.stat(path.join(directory, "stack-secrets.key"))).mode & 0o777, 0o600);
    await assert.rejects(store.remove(selected.connection), /inUse/);
    await fs.unlink(path.join(directory, "stack-secrets.key"));
    await assert.rejects(store.connection(selected.connection), /unavailable/);
    await assert.rejects(store.save({ ...connection,
        id: selected.connection,
        token: "replacement" }), /unavailable/);
    assert.deepEqual(store.binding(cwd), selected);
});
test("edits preserve existing tokens and independent writes are serialized", async t => {
    const { store, selected } = await fixture(t);
    await Promise.all([ store.save({ ...connection,
        id: selected.connection,
        name: "Renamed",
        token: "" }), store.save({ ...connection,
        name: "Second" }) ]);
    assert.equal(store.list().length, 2);
    assert.equal((await store.connection(selected.connection)).token, connection.token);
    await assert.rejects(store.save({ ...connection,
        provider: "infisical",
        url: "http://example.com",
        clientId: "machine" }), /unavailable/);
});
test("secret values preserve newlines and dollar signs; unsafe names, duplicates and invalid values abort", () => {
    const value = "line 1\nline 2 $PATH '${abc}'";
    assert.equal(secretEnvironment([[ "TOKEN", value ]]).TOKEN, value);
    for (const key of [ "PATH", "NODE_OPTIONS", "DOCKER_HOST", "COMPOSE_FILE", "LD_PRELOAD", "BWS_ACCESS_TOKEN", "__proto__", "bad-key" ]) {
        assert.throws(() => secretEnvironment([[ key, "x" ]]));
    }
    assert.throws(() => secretEnvironment([[ "TOKEN", "a" ], [ "TOKEN", "b" ]]));
    assert.throws(() => secretEnvironment([[ "TOKEN", null as unknown as string ]]));
    assert.throws(() => secretEnvironment([]));
    assert.throws(() => secretEnvironment([[ "TOKEN", "a\0b" ]]));
});
test("Doppler uses a scoped token; failures expose neither response nor credential", async t => {
    const calls: Array<{ url: string;
        init: RequestInit }> = [];
    t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
        calls.push({ url,
            init });
        return new Response(JSON.stringify({ TOKEN: "test-value" }));
    });
    assert.equal((await resolveSecrets(connection, binding)).TOKEN, "test-value");
    assert.equal(calls[0].init.redirect, "error");
    assert.equal(new URL(calls[0].url).searchParams.get("include_dynamic_secrets"), "false");
    t.mock.method(globalThis, "fetch", async () => new Response("fixture-leaked-token", { status: 403 }));
    await assert.rejects(resolveSecrets(connection, binding), error => String(error) === "Error: stackSecrets.unavailable" && !JSON.stringify(error).includes("fixture"));
});
test("Infisical authenticates a machine then reads only the selected folder", async t => {
    const calls: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
        calls.push(url);
        if (url.endsWith("/login")) {
            assert.deepEqual(JSON.parse(String(init.body)), { clientId: "machine",
                clientSecret: connection.token });
            return new Response(JSON.stringify({ accessToken: "short-lived" }));
        }
        assert.equal((init.headers as Record<string, string>).Authorization, "Bearer short-lived");
        return new Response(JSON.stringify({ secrets: [{ secretKey: "TOKEN",
            secretValue: "a\nb",
            secretValueHidden: false }] }));
    });
    const values = await resolveSecrets({ ...connection,
        provider: "infisical",
        url: "https://infisical.example",
        clientId: "machine" }, { ...binding,
        secretPath: "/app" });
    assert.equal(values.TOKEN, "a\nb");
    assert.equal(calls.length, 2);
    assert.equal(new URL(calls[1]).searchParams.get("secretPath"), "/app");
    assert.equal(new URL(calls[1]).searchParams.get("includeImports"), "false");
});
test("one operation resolves once, concurrent stacks never share environment or modify process.env", async t => {
    const { cwd, directory, store, selected } = await fixture(t);
    const other = path.join(directory, "other");
    await fs.mkdir(other);
    await store.bind(other, { ...selected,
        environment: "other" });
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (url: string) => {
        calls++;
        return new Response(JSON.stringify({ FIXTURE_SECRET: new URL(url).searchParams.get("config") }));
    });
    const first = secretContext("docker", [ "compose", "up" ], cwd)!;
    const second = secretContext("docker", [ "compose", "up" ], other)!;
    await Promise.all([ withSecretOperation(async () => {
        assert.equal((await prepareSecrets(first)).FIXTURE_SECRET, "dev");
        assert.equal((await prepareSecrets(first)).FIXTURE_SECRET, "dev");
    }), withSecretOperation(async () => {
        assert.equal((await prepareSecrets(second)).FIXTURE_SECRET, "other");
    }) ]);
    assert.equal(calls, 2);
    assert.equal(process.env.FIXTURE_SECRET, undefined);
    assert.equal(secretContext("docker", [ "inspect", "x" ], cwd), undefined);
    assert.equal(secretContext("docker", [ "compose", "--project-directory", cwd, "config" ] )?.command, "config");
});
test("provider outage aborts both process transports before Docker starts", async t => {
    const { cwd } = await fixture(t);
    t.mock.method(globalThis, "fetch", async () => {
        throw new Error("sensitive response");
    });
    await assert.rejects(promisify(execFile)("docker", [ "compose", "up", "-d" ], { cwd }), /stackSecrets.unavailable/);
    await assert.rejects(buffered.spawn("docker", [ "compose", "up", "-d" ], { cwd,
        encoding: "utf8" }), /stackSecrets.unavailable/);
});
test("status bypasses provider and interpolated Compose, preserving service and stopped filters", async t => {
    const { cwd } = await fixture(t);
    const context = secretContext("docker", [ "compose", "ps" ], cwd)!;
    const id = "a".repeat(64);
    const calls: string[][] = [];
    const run = async (args: string[]) => {
        calls.push(args);
        if (args[0] === "ps") {
            return id;
        }
        return JSON.stringify({ ID: id,
            Name: "/demo-web-1",
            Service: "web",
            State: "exited",
            PortsData: {} });
    };
    assert.equal(await secretStackPs(context, [ "compose", "ps", "-aq" ], run), id);
    assert.equal(await secretStackPs(context, [ "compose", "ps", "-q" ], run), "");
    assert.equal(await secretStackPs(context, [ "compose", "ps", "-aq", "other" ], run), "");
    assert.equal(calls[0][3], "label=com.docker.compose.project.working_dir=" + cwd);
    assert.ok(calls.every(args => !args.includes("compose")));
});

test("1Password passes the service token and Environment ID; UI masking does not erase values", async () => {
    const values = await resolveSecrets({ ...connection,
        provider: "onepassword" }, binding, async (token, environment) => {
        assert.equal(token, connection.token);
        assert.equal(environment, binding.environment);
        return { variables: [{ name: "TOKEN",
            value: "actual-secret",
            masked: true }] };
    });
    assert.equal(values.TOKEN, "actual-secret");
});
test("Bitwarden uses stdin-free credentials in child env and a temporary non-secret profile without state", async t => {
    const { directory } = await fixture(t);
    const executable = path.join(directory, "bws");
    await fs.writeFile(executable, `#!/bin/sh
cat "$2" > "${directory}/profile.toml"
printf '%s' "$BWS_ACCESS_TOKEN" > "${directory}/token.txt"
printf '[{"key":"TOKEN","value":"%s"}]' "$2"
`, { mode: 0o700 });
    const oldPath = process.env.PATH;
    process.env.PATH = directory + path.delimiter + oldPath;
    t.after(() => {
        process.env.PATH = oldPath;
    });
    const values = await resolveSecrets({ ...connection,
        provider: "bitwarden",
        url: "https://vault.bitwarden.eu" }, { ...binding,
        project: "a".repeat(36) });
    const profile = await fs.readFile(path.join(directory, "profile.toml"), "utf8");
    assert.match(profile, /^\[profiles\.dockge\]/);
    assert.match(profile, /state_opt_out = "true"/);
    assert.match(profile, /server_api = "https:\/\/api\.bitwarden\.eu"/);
    assert.match(profile, /server_identity = "https:\/\/identity\.bitwarden\.eu"/);
    assert.ok(!profile.includes(connection.token));
    assert.equal(await fs.readFile(path.join(directory, "token.txt"), "utf8"), connection.token);
    await assert.rejects(fs.access(values.TOKEN), /ENOENT/);
});
test("real Compose interpolation receives secrets in both buffered transports without writing an env file", async t => {
    const { cwd } = await fixture(t);
    await fs.writeFile(path.join(cwd, "compose.yaml"), "services:\n  app:\n    image: busybox\n    environment:\n      FIXTURE_SECRET: ${FIXTURE_SECRET:?required}\n");
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ FIXTURE_SECRET: "line1\nline2 $literal" })));
    const first = await promisify(execFile)("docker", [ "compose", "config", "--format", "json" ], { cwd });
    const second = await buffered.spawn("docker", [ "compose", "config", "--format", "json" ], { cwd,
        encoding: "utf8" });
    for (const result of [ first, second ]) {
        assert.equal(JSON.parse(String(result.stdout)).services.app.environment.FIXTURE_SECRET, "line1\nline2 $$literal");
    }
    assert.deepEqual(await fs.readdir(cwd), [ "compose.yaml" ]);
    assert.equal(process.env.FIXTURE_SECRET, undefined);
    await fs.writeFile(path.join(cwd, "compose.yaml"), "services:\n  app:\n    image: busybox\n    invalid_field: ${FIXTURE_SECRET}\n");
    await assert.rejects(promisify(execFile)("docker", [ "compose", "config" ], { cwd }), error => !JSON.stringify(error).includes("line1") && String(error).includes("stackSecrets.unavailable"));
});

test("a missing bare environment variable blocks creation before Docker can mutate containers", async t => {
    const { cwd } = await fixture(t);
    await fs.writeFile(path.join(cwd, "compose.yaml"), "services:\n  app:\n    image: busybox\n    environment:\n      FIXTURE_MISSING_SECRET:\n");
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ DIFFERENT_SECRET: "value" })));
    await assert.rejects(promisify(execFile)("docker", [ "compose", "up", "-d" ], { cwd }), /stackSecrets.unavailable/);
    assert.deepEqual(await fs.readdir(cwd), [ "compose.yaml" ]);
});

test("official Bitwarden CLI reads the generated TOML profile", async t => {
    const binary = process.env.BWS_TEST_BINARY;
    if (!binary) {
        t.skip("Set BWS_TEST_BINARY to verify with the official CLI");
        return;
    }
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-bws-profile-test-"));
    t.after(() => fs.rm(directory, { recursive: true,
        force: true }));
    for (const url of [ "https://vault.bitwarden.com", "https://vault.bitwarden.eu", "https://example.com/bitwarden" ]) {
        const filename = path.join(directory, "config");
        await fs.writeFile(filename, bitwardenProfile(url), { mode: 0o600 });
        await promisify(execFile)(binary, [ "--config-file", filename, "--profile", "dockge", "config", "state-opt-out", "true" ], {
            env: { PATH: process.env.PATH },
            timeout: 10_000,
        });
        const saved = await fs.readFile(filename, "utf8");
        assert.match(saved, /state_opt_out = "true"/);
        assert.ok(saved.includes(url.includes("vault.") ? url.replace("vault.", "api.") : url));
    }
});
