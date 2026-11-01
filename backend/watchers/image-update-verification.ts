/** Verify immutable image IDs and every expected Compose replica, not CLI exit status. */
import { parseResolvedComposeModel } from "../compose-network-namespace";

export type VerificationCommand = (args: string[], timeout: number) => Promise<string>;
export interface ServiceImageTarget {
    service: string;
    image: string;
    imageId: string;
    replicas: number;
}
export class ImageUpdateVerificationError extends Error {
    constructor(message: string, readonly verification: "failed" | "unverified" = "failed") {
        super(message);
    }
}

async function containers(compose: VerificationCommand, docker: VerificationCommand, service: string) {
    try {
        const ids = (await compose([ "ps", "--all", "-q", service ], 15_000)).trim().split(/\s+/).filter(Boolean);
        if (!ids.length) {
            return [];
        }
        const output = await docker([ "container", "inspect", "--format", "{{json .}}", ...ids ], 15_000);
        return output.trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as {
            Image?: string;
            State?: { Running?: boolean;
                Health?: { Status?: string } };
            Config?: { Image?: string;
                Labels?: Record<string, string> };
        });
    } catch (error) {
        throw new ImageUpdateVerificationError(`Cannot inspect service ${service}: ${error instanceof Error ? error.message : String(error)}`, "unverified");
    }
}

export async function captureServiceImageTargets(
    compose: VerificationCommand, docker: VerificationCommand, services: string[],
): Promise<ServiceImageTarget[]> {
    if (!services.length) {
        return [];
    }
    const model = parseResolvedComposeModel(await compose([ "config", "--format", "json" ], 30_000));
    const targets: ServiceImageTarget[] = [];
    for (const service of services) {
        const current = await containers(compose, docker, service);
        // Build-only namespace consumers use their existing Compose-generated image reference.
        const image = model.services[service]?.image ?? current[0]?.Config?.Image;
        if (typeof image !== "string" || !image) {
            throw new ImageUpdateVerificationError(`Cannot verify image for service ${service}`, "unverified");
        }
        if (!current.length || current.some(container => !container.State?.Running)) {
            throw new ImageUpdateVerificationError(`Service ${service} has absent or stopped replicas`);
        }
        targets.push({ service,
            image,
            imageId: "",
            replicas: current.length });
    }
    return targets;
}

/** Snapshot the pulled IDs before up; do not let a moving registry tag redefine success. */
export async function resolveServiceImageTargets(targets: ServiceImageTarget[], docker: VerificationCommand): Promise<void> {
    for (const target of targets) {
        try {
            target.imageId = (await docker([ "image", "inspect", "--format", "{{.Id}}", target.image ], 15_000)).trim();
        } catch (error) {
            throw new ImageUpdateVerificationError(`Cannot inspect expected image for ${target.service}: ${error instanceof Error ? error.message : String(error)}`, "unverified");
        }
        if (!/^sha256:[a-f0-9]{64}$/i.test(target.imageId)) {
            throw new ImageUpdateVerificationError(`Cannot resolve expected image for ${target.service}`, "unverified");
        }
    }
}

export async function verifyServiceImageTargets(
    targets: ServiceImageTarget[], compose: VerificationCommand, docker: VerificationCommand,
): Promise<void> {
    for (const target of targets) {
        const current = await containers(compose, docker, target.service);
        if (current.length !== target.replicas) {
            throw new ImageUpdateVerificationError(`Service ${target.service}: expected ${target.replicas} replicas, found ${current.length}`);
        }
        for (const container of current) {
            if (container.Config?.Labels?.["com.docker.compose.service"] !== target.service
                || !container.State?.Running || container.State.Health?.Status === "unhealthy"
                || container.Image !== target.imageId) {
                throw new ImageUpdateVerificationError(`Service ${target.service}: a replica is stopped, unhealthy or does not run expected image ${target.imageId}`);
            }
        }
    }
}
