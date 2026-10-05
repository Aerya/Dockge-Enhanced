import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ContainerCounts {
    total: number;
    running: number;
    stopped: number;
    paused: number;
}

export function countContainerStates(states: string[]): ContainerCounts {
    const counts = {
        total: 0,
        running: 0,
        stopped: 0,
        paused: 0,
    };
    for (const state of states) {
        counts.total++;
        if (state === "running") {
            counts.running++;
        } else if (state === "paused") {
            counts.paused++;
        } else {
            counts.stopped++;
        }
    }
    return counts;
}

export async function getContainerCounts(): Promise<ContainerCounts> {
    const { stdout } = await execFileAsync("docker", [ "ps", "-a", "--format", "{{.State}}" ], { timeout: 10_000 });
    return countContainerStates(stdout.split(/\r?\n/).map(state => state.trim().toLowerCase()).filter(Boolean));
}
