import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface InspectedImage {
    Id: string;
    RepoTags?: string[];
    RepoDigests?: string[];
    Created?: string;
}

export interface ImageContainerReference {
    id: string;
    name: string;
    state: string;
    status: string;
    stackName?: string;
    service?: string;
}

export interface InspectedImageContainer {
    Id?: string;
    Name?: string;
    Image: string;
    State?: {
        Status?: string;
    };
    Config?: {
        Labels?: Record<string, string> | null;
    };
}

export interface ImageInventory {
    rows: Record<string, string>[];
    inspected: InspectedImage[];
    inspectedById: Map<string, InspectedImage>;
    usedImageIds: Set<string>;
    containersByImageId: Map<string, ImageContainerReference[]>;
}

export interface ImageInventoryOptions {
    inspectImages?: boolean;
    imageInspectBatchSize?: number;
}

export interface ClassifiedImageReference {
    id: string;
    repository: string;
    tag: string;
    size?: string;
    createdSince?: string;
    createdAt?: string;
    status: "running" | "stopped" | "dangling" | "unused";
    containers: ImageContainerReference[];
}

export function normalizeImageId(value: string): string {
    const match = value.trim().toLowerCase().match(/^(?:sha256:)?([a-f0-9]{12,64})$/);
    return match ? `sha256:${match[1]}` : value.trim().toLowerCase();
}

export function sameImageId(left: string, right: string): boolean {
    const a = normalizeImageId(left).replace(/^sha256:/, "");
    const b = normalizeImageId(right).replace(/^sha256:/, "");
    return a.length >= 12 && b.length >= 12 && (a === b || a.startsWith(b) || b.startsWith(a));
}

export function imageIsUsed(imageId: string, usedImageIds: Set<string>): boolean {
    return [ ...usedImageIds ].some(id => sameImageId(id, imageId));
}

export function isDanglingImageRow(row: Record<string, string>): boolean {
    return row["Repository"] === "<none>" && row["Tag"] === "<none>";
}

function containerReference(container: InspectedImageContainer): ImageContainerReference {
    const labels = container.Config?.Labels ?? {};
    const state = container.State?.Status ?? "";
    return {
        id: (container.Id ?? "").slice(0, 12),
        name: (container.Name ?? "").replace(/^\//, ""),
        state,
        status: state,
        stackName: labels["com.docker.compose.project"],
        service: labels["com.docker.compose.service"],
    };
}

export function buildContainerImageIndex(containers: InspectedImageContainer[]): {
    usedImageIds: Set<string>;
    containersByImageId: Map<string, ImageContainerReference[]>;
} {
    const usedImageIds = new Set<string>();
    const containersByImageId = new Map<string, ImageContainerReference[]>();
    for (const container of containers) {
        const imageId = normalizeImageId(container.Image);
        if (!/^sha256:[a-f0-9]{12,64}$/.test(imageId)) {
            continue;
        }
        usedImageIds.add(imageId);
        const references = containersByImageId.get(imageId) ?? [];
        references.push(containerReference(container));
        containersByImageId.set(imageId, references);
    }
    return { usedImageIds,
        containersByImageId };
}

function referencesForImage(
    imageId: string,
    containersByImageId: Map<string, ImageContainerReference[]>,
): ImageContainerReference[] {
    for (const [ usedId, references ] of containersByImageId) {
        if (sameImageId(usedId, imageId)) {
            return references;
        }
    }
    return [];
}

export function classifyImageReferences(inventory: ImageInventory): ClassifiedImageReference[] {
    return inventory.rows.map(row => {
        const id = normalizeImageId(row.ID ?? "");
        const containers = referencesForImage(id, inventory.containersByImageId);
        const running = containers.some(container => [ "running", "restarting" ].includes(container.state));
        const dangling = containers.length === 0 && isDanglingImageRow(row);
        return {
            id,
            repository: row.Repository ?? "<none>",
            tag: row.Tag ?? "<none>",
            size: row.Size,
            createdSince: row.CreatedSince,
            createdAt: inventory.inspectedById.get(id)?.Created ?? row.CreatedAt,
            status: running ? "running" : containers.length > 0 ? "stopped" : dangling ? "dangling" : "unused",
            containers,
        };
    });
}

async function dockerJsonLines(args: string[]): Promise<Record<string, string>[]> {
    const { stdout } = await execFileAsync("docker", args, { maxBuffer: 20 * 1024 * 1024 });
    return (stdout || "").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as Record<string, string>);
}

export function isMissingDockerImageInspectError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
        return /no such image/i.test(String(error));
    }
    const detail = error as { stderr?: string | Buffer; message?: string };
    return /no such image/i.test(`${detail.stderr?.toString() ?? ""} ${detail.message ?? ""}`);
}

async function inspectImageBatch(imageIds: string[]): Promise<InspectedImage[]> {
    if (imageIds.length === 0) {
        return [];
    }
    try {
        const { stdout } = await execFileAsync("docker", [ "image", "inspect", ...imageIds ], {
            maxBuffer: 20 * 1024 * 1024,
        });
        return JSON.parse(stdout || "[]") as InspectedImage[];
    } catch (error) {
        if (!isMissingDockerImageInspectError(error)) {
            throw error;
        }
        // Une image peut disparaître entre `docker images` et l'inspection.
        // Dans ce cas uniquement, on retente individuellement le lot afin de
        // conserver toutes les images encore présentes sans masquer une vraie erreur Docker.
        const surviving: InspectedImage[] = [];
        for (const imageId of imageIds) {
            try {
                const { stdout } = await execFileAsync("docker", [ "image", "inspect", imageId ], {
                    maxBuffer: 20 * 1024 * 1024,
                });
                surviving.push(...JSON.parse(stdout || "[]") as InspectedImage[]);
            } catch (singleError) {
                if (!isMissingDockerImageInspectError(singleError)) {
                    throw singleError;
                }
            }
        }
        return surviving;
    }
}

export async function inspectDockerImages(imageIds: string[], batchSize = 25): Promise<InspectedImage[]> {
    const inspected: InspectedImage[] = [];
    const size = Math.max(1, Math.min(100, Math.trunc(batchSize) || 25));
    for (let offset = 0; offset < imageIds.length; offset += size) {
        inspected.push(...await inspectImageBatch(imageIds.slice(offset, offset + size)));
    }
    return inspected;
}

export async function loadDockerImageInventory(options: ImageInventoryOptions = {}): Promise<ImageInventory> {
    const rows = await dockerJsonLines([ "images", "-a", "--no-trunc", "--format", "{{json .}}" ]);
    const imageIds = [ ...new Set(rows
        .map(row => normalizeImageId(row.ID ?? ""))
        .filter(id => /^sha256:[a-f0-9]{64}$/.test(id))) ];
    const inspected = options.inspectImages === false
        ? []
        : await inspectDockerImages(imageIds, options.imageInspectBatchSize);
    const inspectedById = new Map(inspected.map(image => [ normalizeImageId(image.Id), image ]));
    const { stdout: containerIdsOutput } = await execFileAsync("docker", [ "ps", "-aq" ]);
    const containerIds = containerIdsOutput.trim().split("\n").filter(Boolean);
    const inspectedContainers = containerIds.length > 0
        ? JSON.parse((await execFileAsync("docker", [ "inspect", ...containerIds ], {
            maxBuffer: 20 * 1024 * 1024,
        })).stdout) as InspectedImageContainer[]
        : [];
    const { usedImageIds, containersByImageId } = buildContainerImageIndex(inspectedContainers);
    return {
        rows,
        inspected,
        inspectedById,
        usedImageIds,
        containersByImageId,
    };
}
