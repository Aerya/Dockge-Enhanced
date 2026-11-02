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
export function sidecarStateMount(mount: StateMount, composeDir?: string): { args: string[];
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
    const destination = (value: string) => path.posix.resolve(value);
    const args = [ "--mount", state ];
    if (destination(hostPath) !== "/state") {
        args.push("--mount", alias);
    }
    if (composeDir && destination(composeDir) !== destination(hostPath)) {
        // /state must keep pointing at the writable recovery data, never at
        // an unrelated Compose directory.
        if (destination(composeDir) === "/state") {
            throw new Error("Self-update Compose directory conflicts with the reserved /state mount");
        }
        args.push("--mount", [ "type=bind", mountField(`source=${composeDir}`), mountField(`target=${composeDir}`), "readonly" ].join(","));
    }
    return { hostPath,
        args };
}
