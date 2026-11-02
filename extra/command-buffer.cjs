"use strict";

const native = require("node:child_process");
const { promisify } = require("node:util");
const warned = new Set();
const MIB = 1024 * 1024;

function setting(name, fallback, maximum) {
    const raw = process.env[name];
    if (raw === undefined || raw === "") return fallback;
    if (/^[1-9]\d*$/.test(raw) && Number(raw) <= maximum) return Number(raw);
    if (!warned.has(name)) {
        warned.add(name);
        console.warn(`[commandBuffer] Invalid ${name}; using ${fallback}. Expected an integer from 1 to ${maximum}.`);
    }
    return fallback;
}

function resolveCommandBuffer(original) {
    const factor = setting("DOCKGE_COMMAND_BUFFER_MULTIPLIER", 1, 16);
    const ceiling = setting("DOCKGE_COMMAND_BUFFER_MAX_MIB", 256, 256) * MIB;
    return Math.min(original * factor, ceiling);
}

function commandBufferEnvArgs() {
    const result = [];
    for (const [key, fallback, maximum] of [
        ["DOCKGE_COMMAND_BUFFER_MULTIPLIER", 1, 16],
        ["DOCKGE_COMMAND_BUFFER_MAX_MIB", 256, 256],
    ]) {
        if (process.env[key] !== undefined) result.push("-e", `${key}=${setting(key, fallback, maximum)}`);
    }
    return result;
}

function isBufferOverflow(error) {
    return Boolean(error && (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
        || error.code === "ENOBUFS" || /maxBuffer.*(?:exceeded|length)/i.test(error.message || "")));
}

function sourceLocation() {
    const lines = new Error().stack?.split("\n") || [];
    for (const line of lines) {
        if (line.includes("command-buffer.cjs") || line.includes("buffered-process.ts")) continue;
        const match = line.match(/(?:backend|extra)\/[a-zA-Z0-9_./-]+\.(?:ts|js|cjs):\d+:\d+/);
        if (match) return match[0];
    }
    return "unknown";
}

function commandLabel(args, mode) {
    // Never record shell text, arguments, paths, environment, stdout or stderr.
    const binary = String(args[0] || "").split(/[\\/]/).pop();
    const safe = new Set(["docker", "restic", "git", "rsync", "du", "df", "test", "node", "sh", "bash", "sleep"]);
    const name = mode === "exec" ? "shell" : safe.has(binary) ? binary : "external";
    const sub = Array.isArray(args[1]) ? args[1][0] : "";
    const operations = new Set(["inspect", "ps", "compose", "image", "volume", "network", "stats", "pull", "run", "exec", "check", "dump", "snapshots", "backup", "restore"]);
    return name === "docker" && operations.has(sub) ? `${name} ${sub}` : name;
}

function wrapBuffered(fn, { mode, defaultBytes = MIB }) {
    // A separate forwarding target avoids Node's non-configurable custom
    // promisifier property while leaving the native function untouched.
    return new Proxy(function () {}, {
        get(target, property, receiver) {
            const value = Reflect.get(fn, property, receiver);
            // Node's custom promisifier returns {stdout, stderr} and .child.
            // Wrapping it directly preserves both, unlike promisifying a callback proxy.
            if (property === promisify.custom && typeof value === "function") {
                return wrapBuffered(value, { mode, defaultBytes });
            }
            return value;
        },
        apply(target, thisArg, incoming) {
            const args = [...incoming];
            const index = mode === "exec" ? 1 : Array.isArray(args[1]) ? 2 : 1;
            const supplied = args[index];
            const hasOptions = supplied !== null && typeof supplied === "object" && !Array.isArray(supplied);
            const options = hasOptions ? { ...supplied } : {};
            // A streaming spawn must stay streaming: adding maxBuffer enables capture.
            if (mode === "spawn" && options.encoding == null && options.maxBuffer == null) {
                return Reflect.apply(fn, thisArg, incoming);
            }
            const original = options.maxBuffer ?? defaultBytes;
            options.maxBuffer = resolveCommandBuffer(original);
            if (hasOptions || (index < args.length && supplied == null)) args[index] = options;
            else args.splice(index, 0, options);
            const source = sourceLocation();
            const command = commandLabel(incoming, mode);
            let reported = false;
            const report = error => {
                if (reported || !isBufferOverflow(error)) return;
                reported = true;
                console.error(`[commandBuffer] ${JSON.stringify({ event: "maxBuffer", source, command, maxBuffer: options.maxBuffer, defaultMaxBuffer: original })}`);
            };
            const last = args.length - 1;
            if (typeof args[last] === "function") {
                const callback = args[last];
                args[last] = function (...values) {
                    report(values[0]);
                    return Reflect.apply(callback, this, values);
                };
            } else if (fn === native.exec || fn === native.execFile) {
                // Native callers may only consume the returned ChildProcess.
                // Still observe capture overflow without changing that interface.
                args.push(report);
            }
            try {
                const result = Reflect.apply(fn, thisArg, args);
                // Observe without replacing the promise/ChildProcess, its streams,
                // kill(), pid or rejection object. No process-global monkey patch.
                if (result && typeof result.then === "function") result.then(undefined, report);
                return result;
            } catch (error) {
                report(error);
                throw error;
            }
        },
    });
}

exports.resolveCommandBuffer = resolveCommandBuffer;
exports.commandBufferEnvArgs = commandBufferEnvArgs;
exports.isBufferOverflow = isBufferOverflow;
exports.wrapBuffered = wrapBuffered;
exports.exec = wrapBuffered(native.exec, { mode: "exec" });
exports.execFile = wrapBuffered(native.execFile, { mode: "execFile" });
exports.execFileSync = wrapBuffered(native.execFileSync, { mode: "execFile" });
