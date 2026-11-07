import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "./buffered-process";
import type { ContainerInstance } from "./container-instances";

const exec = promisify(execFile);
export const MAX_CONTAINER_FILE = 1024 * 1024;
const prepare = `set -eu
command -v readlink >/dev/null && command -v stat >/dev/null || exit 41
p=$(readlink -f -- "$1") || exit 42
case "$p" in /proc|/proc/*|/sys|/sys/*|/dev|/dev/*) exit 43;; esac
`;
const listScript =
    prepare +
    `test -d "$p" && test -r "$p" && test -x "$p" || exit 42
printf '%s\\000' "$p"
count=0
for f in "$p"/* "$p"/.[!.]* "$p"/..?*; do
    test -e "$f" || test -L "$f" || continue
    count=$((count + 1))
    if test "$count" -gt 500; then printf '__TRUNCATED__\\000'; break; fi
    kind=other
    if test -L "$f"; then kind=link; elif test -d "$f"; then kind=directory; elif test -f "$f"; then kind=file; fi
    size=$(stat -c '%s' -- "$f" 2>/dev/null) || size=0
    printf '%s\\000%s\\000%s\\000' "\${f##*/}" "$kind" "$size"
done
`;
const readScript =
    prepare +
    `test -f "$p" && test -r "$p" || exit 42
size=$(stat -c '%s' -- "$p") || exit 42
test "$size" -le 1048576 || exit 44
dd if="$p" bs=65536 count=17 2>/dev/null
`;

export function containerFilePath(value: unknown): string {
    if (
        typeof value !== "string" ||
        !value.startsWith("/") ||
        value.length > 4096 ||
        /[\x00-\x1f\x7f]/.test(value)
    ) {
        throw new Error("containerFiles.invalidPath");
    }
    const normalized = path.posix.normalize(value);
    if (/^\/(proc|sys|dev)(\/|$)/.test(normalized)) {
        throw new Error("containerFiles.blockedPath");
    }
    return normalized;
}

export function parseContainerDirectory(output: Buffer) {
    const fields = output.toString("utf8").split("\0");
    const directory = fields.shift()!;
    const entries: Array<{ name: string;
        type: string;
        size: number }> = [];
    let truncated = false;
    for (let i = 0; i < fields.length - 1; i += 3) {
        if (fields[i] === "__TRUNCATED__" && i === fields.length - 2) {
            truncated = true;
            break;
        }
        if (
            !fields[i] ||
            fields[i].includes("/") ||
            ![ "file", "directory", "link", "other" ].includes(fields[i + 1])
        ) {
            throw new Error("containerFiles.unavailable");
        }
        entries.push({
            name: fields[i],
            type: fields[i + 1],
            size: Number(fields[i + 2]) || 0,
        });
    }
    return { path: directory,
        entries,
        truncated };
}

type Inspect = (id: unknown) => Promise<ContainerInstance>;
type Run = (args: string[]) => Promise<Buffer>;
const dockerRead: Run = async (args) => {
    try {
        const result = await exec("docker", args, {
            encoding: "buffer",
            timeout: 15000,
            maxBuffer: 2 * 1024 * 1024,
        });
        return Buffer.from(result.stdout);
    } catch (error) {
        const code = (error as { code?: number }).code;
        throw new Error(
            code === 42
                ? "containerFiles.denied"
                : code === 43
                    ? "containerFiles.blockedPath"
                    : code === 44
                        ? "containerFiles.tooLarge"
                        : "containerFiles.unavailable",
            { cause: error },
        );
    }
};
let active = 0;
export async function readContainerFiles(
    inspect: Inspect,
    id: unknown,
    filePath: unknown,
    action: unknown,
    run: Run = dockerRead,
) {
    if (![ "list", "read" ].includes(String(action)) || active >= 4) {
        throw new Error("containerFiles.unavailable");
    }
    const target = containerFilePath(filePath);
    active++;
    try {
        // Resolve ownership on every request. Never accept a container name or user-supplied command.
        const instance = await inspect(id);
        if (
            !/^[a-f0-9]{12,64}$/i.test(instance.id) ||
            instance.state !== "running"
        ) {
            throw new Error("containerFiles.stopped");
        }
        // No --user or --privileged: retain the image's configured user and filesystem permissions.
        const output = await run([
            "exec",
            instance.id,
            "timeout",
            "12",
            "sh",
            "-c",
            action === "list" ? listScript : readScript,
            "container-files",
            target,
        ]);
        if (action === "list") {
            return parseContainerDirectory(output);
        }
        if (output.length > MAX_CONTAINER_FILE) {
            throw new Error("containerFiles.tooLarge");
        }
        return {
            path: target,
            content: output.toString("base64"),
            size: output.length,
        };
    } finally {
        active--;
    }
}
