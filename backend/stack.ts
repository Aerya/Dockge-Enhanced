import { DockgeServer } from "./dockge-server";
import fs, { promises as fsAsync } from "fs";
import { log } from "./log";
import yaml from "yaml";
import { DockgeSocket, fileExists, ValidationError } from "./util-server";
import path from "path";
import {
    acceptedComposeFileNames,
    COMBINED_TERMINAL_COLS,
    COMBINED_TERMINAL_ROWS,
    CREATED_FILE,
    CREATED_STACK,
    EXITED,
    getComposeTerminalName, getContainerExecTerminalName,
    getStackLogsTerminalName,
    PROGRESS_TERMINAL_ROWS,
    RUNNING, TERMINAL_ROWS,
    UNKNOWN
} from "../common/util-common";
import { InteractiveTerminal, Terminal } from "./terminal";
import childProcessAsync from "promisify-child-process";
import { Settings } from "./settings";
import { intervals } from "./low-power";

// ─── Cache court de getServiceStatusList (point #9 : éviter `docker inspect`
// de TOUS les containers à chaque refresh / chaque onglet ouvert). TTL piloté
// par le mode low-power. Invalidé sur toute opération qui change l'état
// (deploy/start/restart/update → writeMeta). ──────────────────────────────
interface ServiceStatusResult {
    serviceStatusList: Map<string, { state: string; ports: string[]; startedAt: string | null }>;
    lastUpdated: string | null;
    lastStartedAt: string | null;
}
const serviceStatusCache = new Map<string, { at: number; result: ServiceStatusResult }>();

// Nom du fichier d'override compose. Docker Compose le fusionne automatiquement
// avec le fichier principal lorsqu'il est présent dans le dossier de la stack
// (découverte automatique, sans `-f` explicite).
const COMPOSE_OVERRIDE_FILE = "compose.override.yaml";

export class Stack {

    name: string;
    protected _status: number = UNKNOWN;
    protected _composeYAML?: string;
    protected _composeENV?: string;
    protected _composeOverrideYAML?: string;
    protected _configFilePath?: string;
    protected _composeFileName: string = "compose.yaml";
    protected server: DockgeServer;

    protected combinedTerminal? : Terminal;

    protected static managedStackList: Map<string, Stack> = new Map();

    constructor(server : DockgeServer, name : string, composeYAML? : string, composeENV? : string, skipFSOperations = false, composeOverrideYAML? : string) {
        this.name = name;
        this.server = server;
        this._composeYAML = composeYAML;
        this._composeENV = composeENV;
        this._composeOverrideYAML = composeOverrideYAML;

        if (!skipFSOperations) {
            // Check if compose file name is different from compose.yaml
            for (const filename of acceptedComposeFileNames) {
                if (fs.existsSync(path.join(this.path, filename))) {
                    this._composeFileName = filename;
                    break;
                }
            }
        }
    }

    async toJSON(endpoint : string) : Promise<object> {

        // Since we have multiple agents now, embed primary hostname in the stack object too.
        let primaryHostname = await Settings.get("primaryHostname");
        if (!primaryHostname) {
            if (!endpoint) {
                primaryHostname = "localhost";
            } else {
                // Use the endpoint as the primary hostname
                try {
                    primaryHostname = (new URL("https://" + endpoint).hostname);
                } catch (e) {
                    // Just in case if the endpoint is in a incorrect format
                    primaryHostname = "localhost";
                }
            }
        }

        let obj = this.toSimpleJSON(endpoint);
        return {
            ...obj,
            composeYAML: this.composeYAML,
            composeENV: this.composeENV,
            composeOverrideYAML: this.composeOverrideYAML,
            primaryHostname,
        };
    }

    toSimpleJSON(endpoint : string) : object {
        return {
            name: this.name,
            status: this._status,
            tags: [],
            isManagedByDockge: this.isManagedByDockge,
            composeFileName: this._composeFileName,
            endpoint,
        };
    }

    /**
     * Get the status of the stack from `docker compose ps --format json`
     */
    async ps() : Promise<object> {
        let res = await childProcessAsync.spawn("docker", this.getComposeOptions("ps", "--format", "json"), {
            cwd: this.path,
            encoding: "utf-8",
        });
        if (!res.stdout) {
            return {};
        }
        return JSON.parse(res.stdout.toString());
    }

    get isManagedByDockge() : boolean {
        return fs.existsSync(this.path) && fs.statSync(this.path).isDirectory();
    }

    get status() : number {
        return this._status;
    }

    validate() {
        // Check name, allows [a-z][0-9] _ - only
        if (!this.name.match(/^[a-z0-9_-]+$/)) {
            throw new ValidationError("Stack name can only contain [a-z][0-9] _ - only");
        }

        // Check YAML format
        yaml.parse(this.composeYAML);

        // Check override YAML format (if any)
        if (this.composeOverrideYAML.trim() !== "") {
            yaml.parse(this.composeOverrideYAML);
        }

        let lines = this.composeENV.split("\n");

        // Check if the .env is able to pass docker-compose
        // Prevent "setenv: The parameter is incorrect"
        // It only happens when there is one line and it doesn't contain "="
        if (lines.length === 1 && !lines[0].includes("=") && lines[0].length > 0) {
            throw new ValidationError("Invalid .env format");
        }
    }

    get composeYAML() : string {
        if (this._composeYAML === undefined) {
            try {
                this._composeYAML = fs.readFileSync(path.join(this.path, this._composeFileName), "utf-8");
            } catch (e) {
                this._composeYAML = "";
            }
        }
        return this._composeYAML;
    }

    get composeENV() : string {
        if (this._composeENV === undefined) {
            try {
                this._composeENV = fs.readFileSync(path.join(this.path, ".env"), "utf-8");
            } catch (e) {
                this._composeENV = "";
            }
        }
        return this._composeENV;
    }

    get composeOverrideYAML() : string {
        if (this._composeOverrideYAML === undefined) {
            try {
                this._composeOverrideYAML = fs.readFileSync(path.join(this.path, COMPOSE_OVERRIDE_FILE), "utf-8");
            } catch (e) {
                this._composeOverrideYAML = "";
            }
        }
        return this._composeOverrideYAML;
    }

    get path() : string {
        return path.join(this.server.stacksDir, this.name);
    }

    get fullPath() : string {
        let dir = this.path;

        // Compose up via node-pty
        let fullPathDir;

        // if dir is relative, make it absolute
        if (!path.isAbsolute(dir)) {
            fullPathDir = path.join(process.cwd(), dir);
        } else {
            fullPathDir = dir;
        }
        return fullPathDir;
    }

    /**
     * Save the stack to the disk
     * @param isAdd
     */
    async save(isAdd : boolean) {
        this.validate();

        let dir = this.path;

        // Check if the name is used if isAdd
        if (isAdd) {
            if (await fileExists(dir)) {
                throw new ValidationError("Stack name already exists");
            }

            // Create the stack folder
            await fsAsync.mkdir(dir);
        } else {
            if (!await fileExists(dir)) {
                throw new ValidationError("Stack not found");
            }
        }

        // Write or overwrite the compose.yaml
        await fsAsync.writeFile(path.join(dir, this._composeFileName), this.composeYAML);

        const envPath = path.join(dir, ".env");

        // Write or overwrite the .env
        // If .env is not existing and the composeENV is empty, we don't need to write it
        if (await fileExists(envPath) || this.composeENV.trim() !== "") {
            await fsAsync.writeFile(envPath, this.composeENV);
        }

        // Write/overwrite/remove the compose.override.yaml
        // Docker Compose le fusionne automatiquement avec le fichier principal.
        const overridePath = path.join(dir, COMPOSE_OVERRIDE_FILE);
        if (this.composeOverrideYAML.trim() !== "") {
            await fsAsync.writeFile(overridePath, this.composeOverrideYAML);
        } else if (await fileExists(overridePath)) {
            // L'override a été vidé : on supprime le fichier pour éviter une
            // fusion d'un fichier vide (et garder le dossier propre).
            await fsAsync.rm(overridePath, { force: true });
        }
    }

    /** Lit le fichier .dockge-meta.json du stack */
    private async readMeta(): Promise<{ lastUpdated: string | null; lastStartedAt: string | null }> {
        try {
            const raw = await fsAsync.readFile(path.join(this.path, ".dockge-meta.json"), "utf8");
            return JSON.parse(raw) as { lastUpdated: string | null; lastStartedAt: string | null };
        } catch {
            return { lastUpdated: null, lastStartedAt: null };
        }
    }

    /** Met à jour un ou les deux champs dans .dockge-meta.json */
    private async writeMeta(fields: { lastUpdated?: string; lastStartedAt?: string }): Promise<void> {
        // L'état de la stack vient de changer : on invalide le cache de statut
        serviceStatusCache.delete(this.name);
        try {
            const existing = await this.readMeta();
            const updated = { ...existing, ...fields };
            await fsAsync.writeFile(path.join(this.path, ".dockge-meta.json"), JSON.stringify(updated), "utf8");
        } catch { /* non bloquant */ }
    }

    async deploy(socket : DockgeSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("up", "-d", "--remove-orphans"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to deploy, please check the terminal output for more information.");
        }
        const now = new Date().toISOString();
        await this.writeMeta({ lastUpdated: now, lastStartedAt: now });
        return exitCode;
    }

    /**
     * Supprime une stack.
     * @param socket
     * @param options
     *   - removeFiles : si false, on exécute `down` mais on conserve les fichiers
     *     sur le disque (la stack reste éditable). Défaut : true.
     *   - force : si true, en cas d'échec du `down` on supprime quand même le
     *     dossier (utile quand `down` échoue mais qu'on veut nettoyer). Défaut : false.
     */
    async delete(socket: DockgeSocket, options: { removeFiles?: boolean; force?: boolean } = {}) : Promise<number> {
        const removeFiles = options.removeFiles ?? true;
        const force = options.force ?? false;

        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("down", "--remove-orphans"), this.path);
        if (exitCode !== 0 && !force) {
            throw new Error("Failed to delete, please check the terminal output for more information.");
        }

        // Remove the stack folder (sauf si on veut conserver les fichiers)
        if (removeFiles) {
            await fsAsync.rm(this.path, {
                recursive: true,
                force: true
            });
        }

        return exitCode;
    }

    async updateStatus() {
        let statusList = await Stack.getStatusList();
        let status = statusList.get(this.name);

        if (status) {
            this._status = status;
        } else {
            this._status = UNKNOWN;
        }
    }

    /**
     * Checks if a compose file exists in the specified directory.
     * @async
     * @static
     * @param {string} stacksDir - The directory of the stack.
     * @param {string} filename - The name of the directory to check for the compose file.
     * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether any compose file exists.
     */
    static async composeFileExists(stacksDir : string, filename : string) : Promise<boolean> {
        let filenamePath = path.join(stacksDir, filename);
        // Check if any compose file exists
        for (const filename of acceptedComposeFileNames) {
            let composeFile = path.join(filenamePath, filename);
            if (await fileExists(composeFile)) {
                return true;
            }
        }
        return false;
    }

    static async getStackList(server : DockgeServer, useCacheForManaged = false) : Promise<Map<string, Stack>> {
        let stacksDir = server.stacksDir;
        let stackList : Map<string, Stack>;

        // Use cached stack list?
        if (useCacheForManaged && this.managedStackList.size > 0) {
            stackList = this.managedStackList;
        } else {
            stackList = new Map<string, Stack>();

            // Scan the stacks directory, and get the stack list
            let filenameList = await fsAsync.readdir(stacksDir);

            for (let filename of filenameList) {
                try {
                    // Check if it is a directory
                    let stat = await fsAsync.stat(path.join(stacksDir, filename));
                    if (!stat.isDirectory()) {
                        continue;
                    }
                    // If no compose file exists, skip it
                    if (!await Stack.composeFileExists(stacksDir, filename)) {
                        continue;
                    }
                    let stack = await this.getStack(server, filename);
                    stack._status = CREATED_FILE;
                    stackList.set(filename, stack);
                } catch (e) {
                    if (e instanceof Error) {
                        log.warn("getStackList", `Failed to get stack ${filename}, error: ${e.message}`);
                    }
                }
            }

            // Cache by copying
            this.managedStackList = new Map(stackList);
        }

        // Get status from docker compose ls
        let res = await childProcessAsync.spawn("docker", [ "compose", "ls", "--all", "--format", "json" ], {
            encoding: "utf-8",
        });

        if (!res.stdout) {
            return stackList;
        }

        let composeList = JSON.parse(res.stdout.toString());

        for (let composeStack of composeList) {
            let stack = stackList.get(composeStack.Name);

            // This stack probably is not managed by Dockge, but we still want to show it
            if (!stack) {
                // Skip the dockge stack if it is not managed by Dockge
                if (composeStack.Name === "dockge") {
                    continue;
                }
                stack = new Stack(server, composeStack.Name);
                stackList.set(composeStack.Name, stack);
            }

            stack._status = this.statusConvert(composeStack.Status);
            stack._configFilePath = composeStack.ConfigFiles;
        }

        return stackList;
    }

    /**
     * Get the status list, it will be used to update the status of the stacks
     * Not all status will be returned, only the stack that is deployed or created to `docker compose` will be returned
     */
    static async getStatusList() : Promise<Map<string, number>> {
        let statusList = new Map<string, number>();

        let res = await childProcessAsync.spawn("docker", [ "compose", "ls", "--all", "--format", "json" ], {
            encoding: "utf-8",
        });

        if (!res.stdout) {
            return statusList;
        }

        let composeList = JSON.parse(res.stdout.toString());

        for (let composeStack of composeList) {
            statusList.set(composeStack.Name, this.statusConvert(composeStack.Status));
        }

        return statusList;
    }

    /**
     * Convert the status string from `docker compose ls` to the status number
     * Input Example: "exited(1), running(1)"
     * @param status
     */
    static statusConvert(status : string) : number {
        if (status.startsWith("created")) {
            return CREATED_STACK;
        } else if (status.includes("exited")) {
            // If one of the service is exited, we consider the stack is exited
            return EXITED;
        } else if (status.startsWith("running")) {
            // If there is no exited services, there should be only running services
            return RUNNING;
        } else {
            return UNKNOWN;
        }
    }

    static async getStack(server: DockgeServer, stackName: string, skipFSOperations = false) : Promise<Stack> {
        let dir = path.join(server.stacksDir, stackName);

        if (!skipFSOperations) {
            if (!await fileExists(dir) || !(await fsAsync.stat(dir)).isDirectory()) {
                // Maybe it is a stack managed by docker compose directly
                let stackList = await this.getStackList(server, true);
                let stack = stackList.get(stackName);

                if (stack) {
                    return stack;
                } else {
                    // Really not found
                    throw new ValidationError("Stack not found");
                }
            }
        } else {
            //log.debug("getStack", "Skip FS operations");
        }

        let stack : Stack;

        if (!skipFSOperations) {
            stack = new Stack(server, stackName);
        } else {
            stack = new Stack(server, stackName, undefined, undefined, true);
        }

        stack._status = UNKNOWN;
        stack._configFilePath = path.resolve(dir);
        return stack;
    }

    getComposeOptions(command : string, ...extraOptions : string[]) {
        //--env-file ./../global.env --env-file .env
        let options = [ "compose", command, ...extraOptions ];
        if (fs.existsSync(path.join(this.server.stacksDir, "global.env"))) {
            if (fs.existsSync(path.join(this.path, ".env"))) {
                options.splice(1, 0, "--env-file", "./.env");
            }
            options.splice(1, 0, "--env-file", "../global.env");
        }
        return options;
    }

    async start(socket: DockgeSocket) {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("up", "-d", "--remove-orphans"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to start, please check the terminal output for more information.");
        }
        await this.writeMeta({ lastStartedAt: new Date().toISOString() });
        return exitCode;
    }

    async stop(socket: DockgeSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("stop"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to stop, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async startScheduled(): Promise<number> {
        const res = await childProcessAsync.spawn("docker", this.getComposeOptions("up", "-d", "--remove-orphans"), {
            cwd: this.path,
            encoding: "utf-8",
        });
        const exitCode = res.code ?? 0;
        if (exitCode !== 0) throw new Error("Scheduled stack start failed");
        await this.writeMeta({ lastStartedAt: new Date().toISOString() });
        return exitCode;
    }

    async stopScheduled(): Promise<number> {
        const res = await childProcessAsync.spawn("docker", this.getComposeOptions("stop"), {
            cwd: this.path,
            encoding: "utf-8",
        });
        const exitCode = res.code ?? 0;
        if (exitCode !== 0) throw new Error("Scheduled stack stop failed");
        serviceStatusCache.delete(this.name);
        return exitCode;
    }

    async restart(socket: DockgeSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("restart"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to restart, please check the terminal output for more information.");
        }
        await this.writeMeta({ lastStartedAt: new Date().toISOString() });
        return exitCode;
    }

    async restartService(serviceName: string) : Promise<number> {
        if (!serviceName) {
            throw new ValidationError("Service name is required");
        }
        const res = await childProcessAsync.spawn("docker", this.getComposeOptions("restart", serviceName), {
            cwd: this.path,
            encoding: "utf-8",
        });
        const exitCode = res.code ?? 0;
        if (exitCode !== 0) {
            throw new Error(`Failed to restart service ${serviceName}`);
        }
        await this.writeMeta({ lastStartedAt: new Date().toISOString() });
        return exitCode;
    }

    async recreate(socket: DockgeSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        const exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("up", "-d", "--force-recreate", "--remove-orphans"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to recreate, please check the terminal output for more information.");
        }
        await this.writeMeta({ lastStartedAt: new Date().toISOString() });
        return exitCode;
    }

    async recreateInBackground() : Promise<number> {
        const res = await childProcessAsync.spawn("docker", this.getComposeOptions("up", "-d", "--force-recreate", "--remove-orphans"), {
            cwd: this.path,
            encoding: "utf-8",
        });
        const exitCode = res.code ?? 0;
        if (exitCode !== 0) {
            throw new Error("Failed to recreate stack");
        }
        await this.writeMeta({ lastStartedAt: new Date().toISOString() });
        return exitCode;
    }

    async down(socket: DockgeSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("down"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to down, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async update(socket: DockgeSocket) {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("pull"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to pull, please check the terminal output for more information.");
        }

        // Le pull vient de réussir — on enregistre la date de mise à jour
        await this.writeMeta({ lastUpdated: new Date().toISOString() });

        // If the stack is not running, we don't need to restart it
        await this.updateStatus();
        log.debug("update", "Status: " + this.status);
        if (this.status !== RUNNING) {
            return exitCode;
        }

        exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("up", "-d", "--remove-orphans"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to restart, please check the terminal output for more information.");
        }
        // Le up a réussi — on enregistre la date de relance
        await this.writeMeta({ lastStartedAt: new Date().toISOString() });
        return exitCode;
    }

    async pullAndRecreate(socket: DockgeSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("pull"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to pull, please check the terminal output for more information.");
        }

        const now = new Date().toISOString();
        await this.writeMeta({ lastUpdated: now });

        exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("up", "-d", "--force-recreate", "--remove-orphans"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to recreate, please check the terminal output for more information.");
        }
        await this.writeMeta({ lastStartedAt: new Date().toISOString() });
        return exitCode;
    }

    async joinCombinedTerminal(socket: DockgeSocket) {
        await this.joinLogsTerminal(socket);
    }

    async joinLogsTerminal(socket: DockgeSocket, serviceName = "", timestamps = false) {
        const suffix = timestamps ? "_ts" : "";
        const terminalName = getStackLogsTerminalName(socket.endpoint, this.name, serviceName) + suffix;
        const logOptions = [ "-f", "--tail", "100" ];
        if (timestamps) {
            logOptions.push("--timestamps");
        }
        if (serviceName) {
            logOptions.push(serviceName);
        }
        const args = this.getComposeOptions("logs", ...logOptions);
        const terminal = Terminal.getOrCreateTerminal(this.server, terminalName, "docker", args, this.path);
        terminal.enableKeepAlive = true;
        terminal.rows = COMBINED_TERMINAL_ROWS;
        terminal.cols = COMBINED_TERMINAL_COLS;
        if (timestamps) {
            // Reformate 2026-05-30T07:56:24.499026300Z → 2026.05.30-07:56:24
            terminal.outputTransform = (data: string) =>
                data.replace(
                    /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d+Z/g,
                    "$1.$2.$3-$4:$5:$6"
                );
        }
        terminal.join(socket);
        terminal.start();
    }

    async leaveCombinedTerminal(socket: DockgeSocket) {
        await this.leaveLogsTerminal(socket);
    }

    async leaveLogsTerminal(socket: DockgeSocket, serviceName = "", timestamps = false) {
        const suffix = timestamps ? "_ts" : "";
        const terminalName = getStackLogsTerminalName(socket.endpoint, this.name, serviceName) + suffix;
        const terminal = Terminal.getTerminal(terminalName);
        if (terminal) {
            terminal.leave(socket);
        }
    }

    async joinContainerTerminal(socket: DockgeSocket, serviceName: string, shell : string = "sh", index: number = 0) {
        const terminalName = getContainerExecTerminalName(socket.endpoint, this.name, serviceName, index);
        let terminal = Terminal.getTerminal(terminalName);

        if (!terminal) {
            terminal = new InteractiveTerminal(this.server, terminalName, "docker", this.getComposeOptions("exec", serviceName, shell), this.path);
            terminal.rows = TERMINAL_ROWS;
            log.debug("joinContainerTerminal", "Terminal created");
        }

        terminal.join(socket);
        terminal.start();
    }

    async getServiceStatusList() : Promise<{
        serviceStatusList: Map<string, { state: string; ports: string[]; startedAt: string | null }>;
        lastUpdated: string | null;
        lastStartedAt: string | null;
    }> {
        let serviceStatusList = new Map<string, { state: string; ports: string[]; startedAt: string | null }>();
        let lastUpdated: string | null = null;
        let lastStartedAt: string | null = null;

        // ── Cache court (point #9) : réutilise le dernier `inspect` si frais ──
        const cached = serviceStatusCache.get(this.name);
        if (cached && Date.now() - cached.at < intervals().serviceStatusTtl) {
            return cached.result;
        }

        // ── lastUpdated depuis .dockge-meta.json (écrit à chaque pull/deploy) ──
        const meta = await this.readMeta();
        lastUpdated = meta.lastUpdated ?? meta.lastStartedAt ?? null;

        try {
            const res = await childProcessAsync.spawn("docker", this.getComposeOptions("ps", "--format", "json"), {
                cwd: this.path,
                encoding: "utf-8",
            });

            if (!res.stdout) {
                return { serviceStatusList, lastUpdated, lastStartedAt };
            }

            // ── Parse docker compose ps ───────────────────────────────────────
            const containerNameToService = new Map<string, string>();

            for (const line of res.stdout.toString().split("\n")) {
                try {
                    const obj = JSON.parse(line);
                    const ports = (obj.Ports as string).split(/,\s*/).filter((s: string) => s.includes("->"));
                    const state = obj.Health === "" ? obj.State : obj.Health;
                    serviceStatusList.set(obj.Service, { state, ports, startedAt: null });
                    // Associe le nom du container (sans /) au service
                    if (obj.Name) {
                        containerNameToService.set((obj.Name as string).replace(/^\//, ""), obj.Service as string);
                    }
                } catch { /* ligne vide ou invalide */ }
            }

            // ── docker inspect : StartedAt par container ──────────────────────
            const containerNames = [ ...containerNameToService.keys() ];
            if (containerNames.length > 0) {
                try {
                    const inspectRes = await childProcessAsync.spawn(
                        "docker",
                        [ "inspect", "--format", "{{.Name}} {{.State.StartedAt}}", ...containerNames ],
                        { encoding: "utf-8" }
                    );

                    const allTimes: number[] = [];
                    for (const line of (inspectRes.stdout?.toString() ?? "").trim().split("\n")) {
                        const parts = line.trim().split(" ");
                        if (parts.length < 2) continue;
                        const cName    = parts[0].replace(/^\//, "");
                        const startedAt = parts[1];
                        if (!startedAt || startedAt === "0001-01-01T00:00:00Z") continue;

                        const svcName = containerNameToService.get(cName);
                        if (svcName) {
                            const entry = serviceStatusList.get(svcName);
                            if (entry) entry.startedAt = startedAt;
                        }
                        const t = new Date(startedAt).getTime();
                        if (!isNaN(t)) allTimes.push(t);
                    }

                    if (allTimes.length > 0) {
                        lastStartedAt = new Date(Math.max(...allTimes)).toISOString();
                    }
                } catch { /* ignore — inspect non bloquant */ }
            }

            // Fallback lastUpdated si le fichier meta n'existe pas encore
            if (!lastUpdated) lastUpdated = lastStartedAt;
            // Fallback lastStartedAt depuis meta si aucun container running
            if (!lastStartedAt) lastStartedAt = meta.lastStartedAt ?? null;

            const result = { serviceStatusList, lastUpdated, lastStartedAt };
            serviceStatusCache.set(this.name, { at: Date.now(), result });
            return result;
        } catch (e) {
            log.error("getServiceStatusList", e);
            return { serviceStatusList, lastUpdated, lastStartedAt };
        }
    }
}
