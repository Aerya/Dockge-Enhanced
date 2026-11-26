import { execFile } from "../../extra/command-buffer.cjs";
import { promisify } from "node:util";
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { getSecretsStore, secretsError, type Binding, type Connection } from "./store";
import { resolveSecrets } from "./providers";

export interface SecretContext { cwd: string;
    binding: Binding;
    connection: () => Promise<Connection>;
    command: string;
    prefix?: string[] }
/** All Compose entry points (PTY, scheduled spawn and buffered exec) use this lookup. */
export function secretContext(file: string, args: unknown, cwd?: string): SecretContext | undefined {
    if (path.basename(file) !== "docker" || !Array.isArray(args) || args[0] !== "compose") {
        return;
    }
    const store = getSecretsStore();
    if (!store) {
        return;
    }
    const directoryIndex = args.indexOf("--project-directory");
    const directory = directoryIndex >= 0 ? args[directoryIndex + 1] : cwd;
    if (typeof directory !== "string") {
        return;
    }
    const binding = store.binding(directory);
    if (!binding) {
        return;
    }
    let index = 1;
    const values = new Set([ "-f", "--file", "-p", "--project-name", "--project-directory", "--env-file", "--profile", "--parallel", "--ansi", "--progress" ]);
    for (; index < args.length; index++) {
        if (values.has(args[index])) {
            index++;
            continue;
        }
        if (!args[index].startsWith("-")) {
            break;
        }
    }
    return { cwd: directory,
        binding,
        connection: () => store.connection(binding.connection),
        command: args[index],
        prefix: args.slice(0, index) };
}
export function protectedStack(cwd: string): boolean {
    return !!getSecretsStore()?.binding(cwd);
}
const operation = new AsyncLocalStorage<Map<string, Promise<NodeJS.ProcessEnv>>>();
export function withSecretOperation<T>(action: () => Promise<T>): Promise<T> {
    return operation.getStore() ? action() : operation.run(new Map(), action);
}
export function prepareSecrets(context: SecretContext): Promise<NodeJS.ProcessEnv> {
    const scope = operation.getStore();
    const key = context.cwd + JSON.stringify(context.binding);
    if (!scope) {
        return fetchEnvironment(context);
    }
    if (!scope.has(key)) {
        scope.set(key, fetchEnvironment(context));
    }
    return scope.get(key)!;
}
async function fetchEnvironment(context: SecretContext): Promise<NodeJS.ProcessEnv> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const values = await Promise.race([
            context.connection().then(connection => resolveSecrets(connection, context.binding)),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(secretsError()), 45_000);
            }),
        ]);
        return { ...process.env,
            ...values };
    } catch {
        throw secretsError();
    } finally {
        clearTimeout(timer);
    }
}
/** Output of mutating commands can echo resolved Compose values. Keep it out of logs/UI. */
export function secretCommandOutput(command: string, stdout: string | Buffer | null | undefined) {
    return [ "config", "ps", "images", "ls", "version" ].includes(command) ? stdout : "";
}

/** Read lifecycle data without loading Compose or contacting the provider. */
export async function secretStackPs(context: SecretContext, args: string[], docker: (args: string[]) => Promise<string>): Promise<string> {
    const psIndex = args.indexOf("ps");
    const options = args.slice(psIndex + 1);
    const filters = [ "--filter", "label=com.docker.compose.project.working_dir=" + context.cwd, "--filter", "label=com.docker.compose.oneoff=False" ];
    const projectIndex = args.findIndex(arg => arg === "-p" || arg === "--project-name");
    if (projectIndex >= 0 && projectIndex < psIndex) {
        filters.push("--filter", "label=com.docker.compose.project=" + args[projectIndex + 1]);
    }
    const services: string[] = [];
    let status = "";
    for (let i = 0; i < options.length; i++) {
        if (options[i] === "--format") {
            i++;
            continue;
        }
        if (options[i] === "--status") {
            status = options[++i];
            continue;
        }
        if (!options[i].startsWith("-")) {
            services.push(options[i]);
        }
    }
    const ids = (await docker([ "ps", "-aq", ...filters ])).trim().split(/\s+/).filter(Boolean);
    if (ids.some(id => !/^[a-f0-9]{12,64}$/.test(id))) {
        throw secretsError();
    }
    const rows: Array<{ ID: string;
        Name: string;
        Service: string;
        State: string;
        PortsData?: Record<string, Array<{ HostIp: string;
            HostPort: string }>>;
        Publishers?: Array<{ URL: string;
            TargetPort: number;
            PublishedPort: number;
            Protocol: string }> }> = [];
    const format = "{\"ID\":{{json .Id}},\"Name\":{{json .Name}},\"Image\":{{json .Config.Image}},\"Service\":{{json (index .Config.Labels \"com.docker.compose.service\")}},\"Project\":{{json (index .Config.Labels \"com.docker.compose.project\")}},\"State\":{{json .State.Status}},\"ExitCode\":{{json .State.ExitCode}},\"Health\":{{if .State.Health}}{{json .State.Health.Status}}{{else}}\"\"{{end}},\"CreatedAt\":{{json .Created}},\"PortsData\":{{json .NetworkSettings.Ports}}}";
    for (let i = 0; i < ids.length; i += 16) {
        const output = await docker([ "inspect", "--format", format, ...ids.slice(i, i + 16) ]);
        for (const line of output.trim().split("\n").filter(Boolean)) {
            const row: typeof rows[number] = JSON.parse(line);
            if (services.length && !services.includes(row.Service)) {
                continue;
            }
            if (status ? row.State !== status : !options.some(arg => [ "--all", "-a", "-aq", "-qa" ].includes(arg)) && row.State !== "running") {
                continue;
            }
            row.Name = row.Name.replace(/^\//, "");
            row.Publishers = Object.entries(row.PortsData ?? {}).flatMap(([ port, bindings ]) => (bindings ?? []).map((binding) => ({ URL: binding.HostIp,
                TargetPort: Number(port.split("/")[0]),
                PublishedPort: Number(binding.HostPort),
                Protocol: port.split("/")[1] })));
            delete row.PortsData;
            rows.push(row);
        }
    }
    if (options.includes("--services")) {
        return [ ...new Set(rows.map(row => row.Service)) ].join("\n");
    }
    if (options.some(arg => [ "-q", "--quiet", "-aq", "-qa" ].includes(arg))) {
        return rows.map(row => row.ID).join("\n");
    }
    return JSON.stringify(rows);
}

/** Compose resolves .env precedence itself; a missing pass-through must not erase a credential. */
export async function validateSecretCompose(context: SecretContext, env: NodeJS.ProcessEnv) {
    if (!context.prefix || ![ "up", "create", "run", "start", "restart", "build" ].includes(context.command)) {
        return;
    }
    try {
        const { stdout } = await promisify(execFile)("docker", [ ...context.prefix, "config", "--format", "json" ], { cwd: context.cwd,
            env,
            timeout: 15_000,
            maxBuffer: 20 * 1024 * 1024 });
        const model = JSON.parse(stdout) as { services: Record<string, { environment?: Record<string, string | null> }> };
        if (!model.services || Object.values(model.services).some(service => Object.values(service.environment ?? {}).some(value => value === null))) {
            throw secretsError();
        }
    } catch {
        throw secretsError();
    }
}
