import { bitwardenAvailable, installBitwardenCLI } from "../secrets/bitwarden-cli";
import type { DockgeServer } from "../dockge-server";
import type { DockgeSocket } from "../util-server";
import { checkLogin } from "../util-server";
import type { AgentSocket } from "../../common/agent-socket";
import { loadUserAccess } from "../user-access";
import { Stack } from "../stack";
import { getSecretsStore, type Binding, type Connection } from "../secrets/store";
import { prepareSecrets } from "../secrets/runtime";
import { withStackMutation } from "../stack-mutation";

/** Agent RPCs keep credentials and resolution on the instance owning the stack. */
export function registerSecrets(socket: DockgeSocket, server: DockgeServer, agent: AgentSocket) {
    const register = (event: string, handle: (request: Connection & { binding: Binding | null }) => Promise<unknown>) => {
        agent.on(event, async (request, callback) => {
            if (typeof callback !== "function") {
                return;
            }
            try {
                checkLogin(socket);
                if ((await loadUserAccess(socket.userID)).role !== "admin") {
                    throw new Error("access.denied");
                }
                const result = await handle(request as Connection & { binding: Binding | null });
                callback({ ok: true,
                    data: result });
            } catch (error) {
                // Neither provider responses nor submitted credentials are safe diagnostics.
                const message = error instanceof Error ? error.message : "";
                callback({ ok: false,
                    msg: [ "access.denied", "stackSecrets.inUse" ].includes(message) ? message : "stackSecrets.unavailable" });
            }
        });
    };
    register("stackSecrets:toolStatus", async () => ({ available: bitwardenAvailable() }));
    register("stackSecrets:installBitwarden", async () => {
        await installBitwardenCLI();
        return getSecretsStore()!.list();
    });
    register("stackSecrets:list", async () => getSecretsStore()!.list());
    register("stackSecrets:save", async request => {
        await getSecretsStore()!.save(request);
        return getSecretsStore()!.list();
    });
    register("stackSecrets:delete", async request => {
        await getSecretsStore()!.remove(request.id);
        return getSecretsStore()!.list();
    });
    register("stackSecrets:getBinding", async request => {
        const stack = await Stack.getStack(server, request.name);
        return { connections: getSecretsStore()!.list(),
            binding: getSecretsStore()!.binding(stack.path) ?? null };
    });
    register("stackSecrets:bind", async request => {
        const stack = await Stack.getStack(server, request.name);
        await withStackMutation(stack.operationProject, () => getSecretsStore()!.bind(stack.path, request.binding));
        return null;
    });
    register("stackSecrets:test", async request => {
        const stack = await Stack.getStack(server, request.name);
        const store = getSecretsStore()!;
        const binding: Binding | undefined = store.binding(stack.path);
        if (!binding) {
            throw new Error("stackSecrets.unavailable");
        }
        await prepareSecrets({ cwd: stack.path,
            binding,
            connection: () => store.connection(binding.connection),
            command: "test" });
        return null;
        // Never return values, names or provider diagnostics.
    });
}
