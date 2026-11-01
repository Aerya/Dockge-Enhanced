import path from "node:path";

interface StateMount {
    Type?: string;
    Source?: string;
    Name?: string;
}

function mountField(value: string): string {
    return /[",\r\n]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}

/** Docker Desktop reports drive paths, but the Linux sidecar needs a POSIX destination. */
export function sidecarStateMount(mount: StateMount): { args: string[];
    hostPath: string } {
    if (!mount.Source || ![ "bind", "volume" ].includes(mount.Type ?? "")) {
        throw new Error("Self-update requires an identifiable data bind mount or volume");
    }
    const source = mount.Type === "volume" ? mount.Name : mount.Source;
    if (!source) {
        throw new Error("Self-update data volume name is missing");
    }
    const drive = /^([a-z]):[\\/](.*)$/i.exec(mount.Source);
    const hostPath = drive
        ? `/run/desktop/mnt/host/${drive[1].toLowerCase()}/${drive[2].replaceAll("\\", "/")}`
        : mount.Source;
    if (!path.posix.isAbsolute(hostPath) || hostPath.includes("\0") || hostPath.split("/").includes("..")) {
        throw new Error("Self-update host data path is invalid");
    }
    const state = [ `type=${mount.Type}`, mountField(`source=${source}`), "target=/state" ].join(",");
    const alias = [ "type=bind", mountField(`source=${mount.Source}`), mountField(`target=${hostPath}`), "readonly" ].join(",");
    return { hostPath,
        args: [ "--mount", state, "--mount", alias ] };
}
