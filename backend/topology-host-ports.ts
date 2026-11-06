import { readFile, readdir, readlink } from "node:fs/promises";
import { endianness } from "node:os";
import type { TopologyContainer } from "../common/docker-topology";

export function parseOwnedSockets(text: string, owned: Set<string>, protocol: string, ipv6 = false): TopologyContainer["ports"] {
    return text.split("\n").slice(1).flatMap(line => {
        const fields = line.trim().split(/\s+/);
        if (!owned.has(fields[9]) || (protocol === "tcp" ? fields[3] !== "0A" : fields[3] !== "07")) {
            return [];
        }
        const [ hex, port ] = fields[1].split(":");
        if (!new RegExp(ipv6 ? "^[0-9A-F]{32}$" : "^[0-9A-F]{8}$", "i").test(hex)) {
            return [];
        }
        const bytes = Buffer.from(hex, "hex");
        if (endianness() === "LE") {
            bytes.swap32();
        }
        const address = ipv6 ? Array.from({ length: 8 }, (_, i) => bytes.readUInt16BE(i * 2).toString(16)).join(":") : [ ...bytes ].join(".");
        const published = parseInt(port, 16);
        return published > 0 && published <= 65535 ? [{ address,
            published,
            target: published,
            protocol }] : [];
    });
}

/** No exec, nsenter, new mounts or privileges. Refuse PID reuse / a remote daemon's PID. */
export async function hostContainerPorts(id: string, pid: number): Promise<TopologyContainer["ports"] | null> {
    if (!/^[a-f0-9]{64}$/.test(id) || !Number.isSafeInteger(pid) || pid < 1) {
        return null;
    }
    try {
        const group = await readFile(`/proc/${pid}/cgroup`, "utf8");
        if (!group.includes(id)) {
            return null;
        }
        const deadline = Date.now() + 2000;
        const inodes = new Set<string>();
        for (const entry of await readdir("/proc")) {
            if (Date.now() > deadline) {
                return null;
            }
            if (!/^\d+$/.test(entry)) {
                continue;
            }
            let owner: string;
            try {
                owner = await readFile(`/proc/${entry}/cgroup`, "utf8");
            } catch {
                continue; // An unrelated process may disappear or be private.
            }
            if (owner !== group) {
                continue;
            }
            // A denied descriptor directory means attribution is incomplete, not zero sockets.
            for (const fd of await readdir(`/proc/${entry}/fd`)) {
                if (Date.now() > deadline) {
                    return null;
                }
                const target = await readlink(`/proc/${entry}/fd/${fd}`).catch((error: NodeJS.ErrnoException) => {
                    if (error.code === "ENOENT") {
                        return ""; // Descriptor closed during inspection.
                    }
                    throw error; // Permission failures must not look like zero sockets.
                });
                const match = /^socket:\[(\d+)\]$/.exec(target);
                if (match) {
                    inodes.add(match[1]);
                }
            }
        }
        const ports: TopologyContainer["ports"] = [];
        for (const protocol of [ "tcp", "udp" ]) {
            for (const suffix of [ "", "6" ]) {
                ports.push(...parseOwnedSockets(await readFile(`/proc/${pid}/net/${protocol}${suffix}`, "utf8"), inodes, protocol, suffix === "6"));
            }
        }
        if (await readFile(`/proc/${pid}/cgroup`, "utf8") !== group) {
            return null;
        }
        return ports;
    } catch {
        return null;
    }
}
