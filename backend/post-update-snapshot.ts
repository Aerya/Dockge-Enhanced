import { postUpdatePolicy, type PostUpdatePolicy } from "../common/post-update-policy";
import { parseResolvedComposeModel } from "./compose-network-namespace";
import type { VerificationCommand } from "./watchers/image-update-verification";

export interface PostUpdateSnapshot {
    service: string;
    image: string;
    oldImageId: string;
    policy: PostUpdatePolicy;
    replicas: number;
    targetImageId?: string;
}

interface ContainerImage {
    Image: string;
    Config?: { Labels?: Record<string, string> };
    State?: { Running?: boolean;
        Health?: { Status?: string } };
}

async function serviceContainers(compose: VerificationCommand, docker: VerificationCommand, service: string): Promise<ContainerImage[]> {
    const ids = (await compose([ "ps", "--all", "-q", service ], 15_000)).trim().split(/\s+/).filter(Boolean);
    const containers: ContainerImage[] = [];
    // Bounded inspection, including stacks with many replicas.
    for (let offset = 0; offset < ids.length; offset += 16) {
        const result = await docker([ "container", "inspect", "--format", "{\"Image\":{{json .Image}},\"State\":{{json .State}},\"Config\":{\"Labels\":{{json .Config.Labels}}}}", ...ids.slice(offset, offset + 16) ], 15_000);
        for (const line of result.trim().split("\n").filter(Boolean)) {
            const container = JSON.parse(line) as ContainerImage | null;
            if (!container || typeof container.Image !== "string" || !container.State || !container.Config) {
                throw new Error("Cannot read post-update container state");
            }
            containers.push(container);
        }
    }
    return containers;
}

/** Capture the images actually running, never the possibly already moved local tag. */
export async function capturePostUpdateSnapshot(compose: VerificationCommand, docker: VerificationCommand, targets?: string[]): Promise<PostUpdateSnapshot[]> {
    const model = parseResolvedComposeModel(await compose([ "config", "--format", "json" ], 30_000));
    const result: PostUpdateSnapshot[] = [];
    for (const service of targets ?? Object.keys(model.services)) {
        const definition = model.services[service];
        if (!definition || typeof definition.image !== "string") {
            continue;
        }
        const current = await serviceContainers(compose, docker, service);
        const ids = [ ...new Set(current.map(container => container.Image)) ];
        // No invented rollback for mixed versions, stopped services or unknown image IDs.
        if (!current.length || ids.length !== 1 || !/^sha256:[a-f0-9]{64}$/i.test(ids[0])
            || current.some(container => !container.State?.Running || container.Config?.Labels?.["com.docker.compose.service"] !== service)) {
            continue;
        }
        const labels = definition.labels;
        result.push({ service,
            image: definition.image,
            oldImageId: ids[0],
            replicas: current.length,
            policy: postUpdatePolicy(labels && typeof labels === "object" ? labels as Record<string, unknown> | unknown[] : undefined) });
    }
    return result;
}

/** Resolve after pull but before recreation; a concurrent registry/tag change is not success. */
export async function resolvePostUpdateTargets(snapshots: PostUpdateSnapshot[], docker: VerificationCommand): Promise<void> {
    for (const snapshot of snapshots) {
        const id = (await docker([ "image", "inspect", "--format", "{{.Id}}", snapshot.image ], 15_000)).trim();
        if (!/^sha256:[a-f0-9]{64}$/i.test(id)) {
            throw new Error("Cannot resolve post-update target image");
        }
        snapshot.targetImageId = id;
    }
}

/** Only verified replacements authorize cleanup. An uncertain update retains the old image. */
export async function verifiedPostUpdateSnapshots(snapshots: PostUpdateSnapshot[], compose: VerificationCommand, docker: VerificationCommand): Promise<PostUpdateSnapshot[]> {
    const verified: PostUpdateSnapshot[] = [];
    for (const snapshot of snapshots) {
        if (!snapshot.targetImageId || snapshot.oldImageId === snapshot.targetImageId) {
            continue;
        }
        const current = await serviceContainers(compose, docker, snapshot.service);
        if (current.length === snapshot.replicas && current.every(container => container.Image === snapshot.targetImageId
            && container.State?.Running && container.State.Health?.Status !== "unhealthy"
            && container.Config?.Labels?.["com.docker.compose.service"] === snapshot.service)) {
            verified.push(snapshot);
        }
    }
    return verified;
}
