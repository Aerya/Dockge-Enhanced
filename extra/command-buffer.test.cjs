"use strict";
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { promisify } = require("node:util");
const native = require("node:child_process");
const library = require("promisify-child-process");
const fs = require("node:fs");
const path = require("node:path");
const buffer = require("./command-buffer.cjs");
const MIB = 1024 * 1024;
const keys = ["DOCKGE_COMMAND_BUFFER_MULTIPLIER", "DOCKGE_COMMAND_BUFFER_MAX_MIB"];
const originalEnv = keys.map(key => process.env[key]);
afterEach(() => keys.forEach((key, i) => {
    if (originalEnv[i] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[i];
}));
function defaults() { keys.forEach(key => delete process.env[key]); }
const output = bytes => ["-e", `process.stdout.write("x".repeat(${bytes}))`];
async function captureErrors(run) {
    const messages = [];
    const original = console.error;
    console.error = message => messages.push(message);
    try { await run(messages); } finally { console.error = original; }
}

test("defaults preserve each existing buffer and overrides are bounded", () => {
    defaults();
    for (const size of [4096, 200 * 1024, MIB, 4 * MIB, 20 * MIB, 50 * MIB]) {
        assert.equal(buffer.resolveCommandBuffer(size), size);
    }
    process.env[keys[0]] = "2";
    process.env[keys[1]] = "64";
    assert.equal(buffer.resolveCommandBuffer(4 * MIB), 8 * MIB);
    assert.equal(buffer.resolveCommandBuffer(50 * MIB), 64 * MIB);
    assert.deepEqual(buffer.commandBufferEnvArgs(), ["-e", keys[0] + "=2", "-e", keys[1] + "=64"]);
});

test("invalid environment values fall back without logging their contents", () => {
    defaults();
    const messages = [];
    const original = console.warn;
    console.warn = message => messages.push(message);
    try {
        for (const value of ["0", "-1", "1.5", "secret-token", "999999999999999999999"]) {
            process.env[keys[0]] = value;
            process.env[keys[1]] = value;
            assert.equal(buffer.resolveCommandBuffer(MIB), MIB);
            assert.deepEqual(buffer.commandBufferEnvArgs(), ["-e", keys[0] + "=1", "-e", keys[1] + "=256"]);
        }
        assert.equal(messages.length, 2);
        assert.ok(!messages.join("").includes("secret-token"));
    } finally { console.warn = original; }
});

test("native promisify keeps stdout, stderr, child, cwd and env", async () => {
    defaults();
    const promise = promisify(buffer.execFile)(process.execPath, ["-e", "process.stdout.write(process.cwd()); process.stderr.write(process.env.FIXTURE)"], {
        cwd: __dirname, env: { ...process.env, FIXTURE: "fixture" },
    });
    assert.ok(promise.child.pid);
    assert.equal(typeof promise.child.kill, "function");
    assert.deepEqual(await promise, { stdout: __dirname, stderr: "fixture" });
});

test("native callback overloads including undefined options and binary output", async () => {
    defaults();
    for (const args of [
        [process.execPath, output(10)],
        [process.execPath, output(10), undefined],
        [process.execPath, output(10), { encoding: "buffer" }],
    ]) {
        await new Promise((resolve, reject) => {
            const child = buffer.execFile(...args, (error, stdout) => {
                if (error) return reject(error);
                assert.equal(stdout.length, 10);
                if (args[2]?.encoding === "buffer") assert.ok(Buffer.isBuffer(stdout));
                resolve();
            });
            assert.ok(child.pid);
        });
    }
    assert.equal((await promisify(buffer.exec)("printf fixture")).stdout, "fixture");
});

test("native overflow is diagnosed once and configured increase succeeds", async () => {
    defaults();
    await captureErrors(async messages => {
        await assert.rejects(promisify(buffer.execFile)(process.execPath, output(MIB + 1)), { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });
        assert.equal(messages.length, 1);
        assert.match(messages[0], /"maxBuffer":1048576/);
        assert.match(messages[0], /"command":"node"/);
        process.env[keys[0]] = "2";
        assert.equal((await promisify(buffer.execFile)(process.execPath, output(MIB + 1))).stdout.length, MIB + 1);
        assert.equal(messages.length, 1);
    });
});

test("library capture retains child interface and its combined stdout/stderr limit", async () => {
    defaults();
    const spawn = buffer.wrapBuffered(library.spawn, { mode: "spawn", defaultBytes: 200 * 1024 });
    await captureErrors(async messages => {
        const args = ["-e", 'process.stdout.write("x".repeat(120000));process.stderr.write("y".repeat(120000))'];
        const child = spawn(process.execPath, args, { encoding: "utf8" });
        assert.ok(child.pid);
        assert.equal(typeof child.kill, "function");
        assert.ok(child.stdout);
        await assert.rejects(child, /maxBuffer/);
        assert.equal(messages.length, 1);
        process.env[keys[0]] = "2";
        const result = await spawn(process.execPath, args, { encoding: "utf8" });
        assert.equal(result.stdout.length + result.stderr.length, 240000);
    });
});

test("native callers without callbacks also report capture overflow", async () => {
    defaults();
    await captureErrors(async messages => {
        const child = buffer.execFile(process.execPath, output(MIB * 2));
        await new Promise(resolve => child.once("close", resolve));
        assert.equal(messages.length, 1);
    });
});

test("validated environment passed to a detached helper applies the same policy", async () => {
    defaults();
    process.env[keys[0]] = "3";
    const env = { ...process.env };
    for (const key of keys) delete env[key];
    const args = buffer.commandBufferEnvArgs();
    for (let i = 1; i < args.length; i += 2) {
        const [key, value] = args[i].split("=");
        env[key] = value;
    }
    const script = 'process.stdout.write(String(require("./command-buffer.cjs").resolveCommandBuffer(4096)))';
    assert.equal(native.execFileSync(process.execPath, ["-e", script], { cwd: __dirname, env, encoding: "utf8" }), "12288");
});

test("streaming spawn is untouched and does not start buffering", async () => {
    defaults();
    process.env[keys[1]] = "1";
    const spawn = buffer.wrapBuffered(library.spawn, { mode: "spawn" });
    const child = spawn(process.execPath, output(2 * MIB), {});
    let bytes = 0;
    child.stdout.on("data", data => { bytes += data.length; });
    await child;
    assert.equal(bytes, 2 * MIB);
});

test("sync overflow and low explicit limits use the same policy", async () => {
    defaults();
    await captureErrors(async messages => {
        assert.throws(() => buffer.execFileSync(process.execPath, output(MIB * 2)), { code: "ENOBUFS" });
        await assert.rejects(promisify(buffer.execFile)(process.execPath, output(8192), { maxBuffer: 4096 }), { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });
        assert.equal(messages.length, 2);
        assert.match(messages[1], /"maxBuffer":4096/);
        process.env[keys[0]] = "2";
        assert.equal(buffer.execFileSync(process.execPath, output(8192), { maxBuffer: 4096 }).length, 8192);
    });
});

test("ordinary failures, timeout and cancellation remain failures without overflow logs", async () => {
    defaults();
    await captureErrors(async messages => {
        await assert.rejects(promisify(buffer.execFile)(process.execPath, ["-e", "process.exit(7)"]), { code: 7 });
        await assert.rejects(promisify(buffer.execFile)(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeout: 50 }), error => error.killed);
        const controller = new AbortController();
        const promise = promisify(buffer.execFile)(process.execPath, ["-e", "setInterval(()=>{},1000)"], { signal: controller.signal });
        controller.abort();
        await assert.rejects(promise, { name: "AbortError" });
        assert.equal(messages.length, 0);
    });
});

test("diagnostics preserve error identity and never include arguments, paths or output", async () => {
    defaults();
    const error = Object.assign(new Error("maxBuffer exceeded secret-output"), { stdout: "secret-output" });
    const wrapped = buffer.wrapBuffered(() => Promise.reject(error), { mode: "execFile" });
    await captureErrors(async messages => {
        await assert.rejects(wrapped("/private/path/docker", ["inspect", "secret-container", "--token=secret-token"], { env: { PASSWORD: "secret-password" } }), value => value === error);
        assert.equal(messages.length, 1);
        assert.match(messages[0], /"command":"docker inspect"/);
        assert.match(messages[0], /extra\/command-buffer.test.cjs:\d+/);
        assert.doesNotMatch(messages[0], /secret|private/);
    });
});

test("runtime capture imports and packaged sidecars cannot bypass diagnostics", () => {
    const root = path.resolve(__dirname, "..");
    for (const file of fs.readdirSync(path.join(root, "backend"), { recursive: true })) {
        if (!file.endsWith(".ts") || file.endsWith(".test.ts") || file === "buffered-process.ts") continue;
        const source = fs.readFileSync(path.join(root, "backend", file), "utf8");
        assert.doesNotMatch(source, /from ["']promisify-child-process["']/, file);
        assert.doesNotMatch(source, /import\s*\{[^}]*\bexec(?:File|Sync|FileSync)?\b[^}]*\}\s*from ["'](?:node:)?child_process["']/, file);
    }
    assert.match(fs.readFileSync(path.join(__dirname, "self-update-sidecar/Dockerfile"), "utf8"), /COPY[^\n]*extra\/command-buffer.cjs \/command-buffer.cjs/);
    for (const file of ["self-update-sidecar/index.js", "external-stack-access-sidecar/index.cjs"]) {
        assert.match(fs.readFileSync(path.join(__dirname, file), "utf8"), /require\("\.\.\/command-buffer.cjs"\)/);
    }
    assert.equal(typeof native.execFile, "function");
    assert.notEqual(native.execFile, buffer.execFile);
});

test("packaged updater retains a useful source location without absolute paths", async () => {
    const { runInNewContext } = require("node:vm");
    const wrapped = buffer.wrapBuffered(() => { throw Object.assign(new Error("overflow"), { code: "ENOBUFS" }); }, { mode: "execFile" });
    await captureErrors(async messages => {
        assert.throws(() => runInNewContext('wrapped("docker", ["inspect"])', { wrapped }, { filename: "/updater/index.js" }), { code: "ENOBUFS" });
        assert.equal(messages.length, 1);
        assert.match(messages[0], /extra\/self-update-sidecar\/index.js:1:/);
        assert.doesNotMatch(messages[0], /"source":"\//);
    });
});
