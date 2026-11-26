import type { ExecFileOptions } from "node:child_process";
import original from "promisify-child-process";
import { wrapBuffered } from "../extra/command-buffer.cjs";

import { execFile as nativeExecFile } from "../extra/command-buffer.cjs";
import { promisify } from "node:util";
import { prepareSecrets, secretContext, secretCommandOutput, secretStackPs, validateSecretCompose } from "./secrets/runtime";
import { secretsError } from "./secrets/store";
export { exec } from "../extra/command-buffer.cjs";

const nativeAsync = promisify(nativeExecFile);
// Preserve the native ChildProcess contract for ordinary callback users.
export const execFile: typeof nativeExecFile = function (this: unknown, ...args: unknown[]) {
    const [ file, argv, options ] = args as [string, string[], ExecFileOptions & { cwd?: string }];
    if (secretContext(file, argv, options?.cwd)) {
        throw secretsError();
    }
    return Reflect.apply(nativeExecFile, this, args);
} as typeof nativeExecFile;
Object.defineProperty(execFile, promisify.custom, { value: async (file: string, args: string[], options: ExecFileOptions & { cwd?: string } = {}) => {
    const context = secretContext(file, args, options.cwd);
    if (!context) {
        return nativeAsync(file, args, options);
    }
    if (context.command === "ps") {
        const stdout = await secretStackPs(context, args, async command => String((await nativeAsync("docker", command, { cwd: context.cwd,
            timeout: 30_000,
            maxBuffer: 8 * 1024 * 1024 })).stdout));
        return { stdout,
            stderr: "" };
    }
    const env = await prepareSecrets(context);
    await validateSecretCompose(context, env);
    try {
        const result = await nativeAsync(file, args, { ...options,
            env });
        return { stdout: secretCommandOutput(context.command, result.stdout),
            stderr: "" };
    } catch {
        throw secretsError();
    }
} });
const bufferedSpawn = wrapBuffered(original.spawn, { mode: "spawn",
    defaultBytes: 200 * 1024 });
const spawn: typeof original.spawn = new Proxy(bufferedSpawn, { apply(target, self, incoming) {
    const [ file, args, options = {} ] = incoming;
    const context = secretContext(file, args, options.cwd);
    if (!context) {
        return Reflect.apply(target, self, incoming);
    }
    return (async () => {
        if (context.command === "ps") {
            const stdout = await secretStackPs(context, args, async command => String((await nativeAsync("docker", command, { cwd: context.cwd,
                timeout: 30_000,
                maxBuffer: 8 * 1024 * 1024 })).stdout));
            return { stdout,
                stderr: "",
                code: 0,
                signal: null };
        }
        const env = await prepareSecrets(context);
        await validateSecretCompose(context, env);
        try {
            const result = await Reflect.apply(target, self, [ file, args, { ...options,
                env }]);
            return { ...result,
                stdout: secretCommandOutput(context.command, result.stdout),
                stderr: "" };
        } catch {
            throw secretsError();
        }
    })();
} });

export default {
    ...original,
    spawn,
    fork: wrapBuffered(original.fork, { mode: "spawn",
        defaultBytes: 200 * 1024 }),
    exec: wrapBuffered(original.exec, { mode: "exec" }),
    execFile: wrapBuffered(original.execFile, { mode: "execFile" }),
};
