import type { DockgeServer } from "./dockge-server";
import { Stack } from "./stack";
import { topologyStackNames } from "./docker-topology";
import { executeNetworkRestart, planNetworkRestart, readNetworkRestartContainers } from "./network-restart";
import { tryReserveDockerUpdate } from "./self-update/operation-coordinator";
import { withStackMutation } from "./stack-mutation";
import { resolveCurrentContainer } from "./current-container";

export async function previewNetworkRestart(server: DockgeServer, stackName: string) {
    await Stack.getStack(server, stackName);
    const names = await topologyStackNames(server);
    const rows = await readNetworkRestartContainers();
    return planNetworkRestart(rows.map(row => ({ ...row,
        stack: names.get(row.project)?.name })), stackName);
}

const runtime = {
    preview: previewNetworkRestart,
    getStack: async (server: DockgeServer, name: string): Promise<Pick<Stack, "operationProject" | "checkNetworkRestartPrerequisites" | "recordNetworkRestart">> => Stack.getStack(server, name),
    current: resolveCurrentContainer,
    blocked: async (dataDir: string) => {
        const { isSelfUpdateBlockingImageMutations } = await import("./watchers/image-watcher");
        return isSelfUpdateBlockingImageMutations(dataDir);
    },
    execute: executeNetworkRestart,
};

export async function restartNetworkDependents(server: DockgeServer, stackName: string, token: unknown, dependencies = runtime) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
        throw new Error("networkRestart.changed");
    }
    const reservation = tryReserveDockerUpdate("image-update");
    if (!reservation) {
        throw new Error("networkRestart.busy");
    }
    try {
        if (await dependencies.blocked(server.config.dataDir)) {
            throw new Error("networkRestart.busy");
        }
        const preview = await dependencies.preview(server, stackName);
        if (preview.token !== token) {
            throw new Error("networkRestart.changed");
        }
        const stacks = await Promise.all([ ...new Set(preview.containers.map(row => row.stack!)) ].sort().map(name => dependencies.getStack(server, name)));
        const lock = async (index: number): Promise<string[]> => {
            if (index < stacks.length) {
                return withStackMutation(stacks[index].operationProject, () => lock(index + 1));
            }
            const checked = await dependencies.preview(server, stackName);
            if (checked.token !== token) {
                throw new Error("networkRestart.changed");
            }
            const self = (await dependencies.current()).Id;
            if (!self || checked.containers.some(row => row.id === self)) {
                throw new Error("networkRestart.self");
            }
            for (const stack of stacks) {
                await stack.checkNetworkRestartPrerequisites();
            }
            const completed = await dependencies.execute(checked);
            for (const stack of stacks) {
                await stack.recordNetworkRestart();
            }
            return completed;
        };
        return await lock(0);
    } finally {
        reservation.release();
    }
}
