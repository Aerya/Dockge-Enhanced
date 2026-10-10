/** Stack-wide image policy: resolve eligible services, not client-supplied image keys. */
import { createHash } from "crypto";
import { composeLabelIsFalse, LABEL_IMAGEUPDATES_CHECK } from "../../common/compose-labels";
import type { ResolvedComposeModel } from "../compose-network-namespace";
import type { AutoUpdateEntry } from "./image-watcher";

export type StackBulkMode = "off" | "immediate" | "scheduled";

export interface StackBulkRequest {
    stack: string;
    mode: StackBulkMode;
    time?: string;
    preserveExisting: boolean;
    previewToken?: string;
}

export interface StackBulkPlan {
    stack: string;
    mode: StackBulkMode;
    time?: string;
    preserveExisting: boolean;
    previewToken: string;
    eligible: number;
    excludedServices: number;
    noImageServices: number;
    sharedImageServices: number;
    preserved: number;
    changed: number;
    unchanged: number;
    changes: { key: string;
        image: string;
        before: string;
        after: string }[];
}

export function validateStackBulkRequest(input: unknown): StackBulkRequest {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Paramètres de mise à jour de stack invalides");
    }
    const raw = input as Record<string, unknown>;
    const stack = raw.stack;
    if (typeof stack !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(stack)) {
        throw new Error("Nom de stack invalide");
    }
    if (raw.mode !== "off" && raw.mode !== "immediate" && raw.mode !== "scheduled") {
        throw new Error("Mode de mise à jour groupée invalide");
    }
    if (typeof raw.preserveExisting !== "boolean") {
        throw new Error("Le choix de conservation des exceptions est obligatoire");
    }
    if (raw.mode === "scheduled" && (typeof raw.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time))) {
        throw new Error("Heure HH:MM invalide");
    }
    if (raw.previewToken !== undefined && (typeof raw.previewToken !== "string" || !/^[0-9a-f]{64}$/.test(raw.previewToken))) {
        throw new Error("Aperçu invalide");
    }
    return {
        stack,
        mode: raw.mode,
        ...(raw.mode === "scheduled" ? { time: raw.time as string } : {}),
        preserveExisting: raw.preserveExisting,
        ...(raw.previewToken ? { previewToken: raw.previewToken as string } : {}),
    };
}

export function buildStackBulkPlan(
    request: StackBulkRequest,
    model: ResolvedComposeModel,
    entries: Record<string, AutoUpdateEntry>,
): StackBulkPlan {
    const images = new Set<string>();
    let excludedServices = 0;
    let noImageServices = 0;
    let sharedImageServices = 0;
    const services = Object.entries(model.services).sort(([ a ], [ b ]) => a.localeCompare(b));
    for (const [ , service ] of services) {
        if (composeLabelIsFalse(service.labels as Record<string, unknown> | unknown[] | undefined, LABEL_IMAGEUPDATES_CHECK)) {
            excludedServices++;
            continue;
        }
        if (typeof service.image !== "string" || !service.image.trim()) {
            noImageServices++;
            continue;
        }
        const image = service.image.trim();
        if (images.has(image)) {
            sharedImageServices++;
        }
        images.add(image);
    }
    if (images.size > 1000) {
        throw new Error("Trop d’images pour une seule opération groupée");
    }
    const changes: StackBulkPlan["changes"] = [];
    let preserved = 0;
    let unchanged = 0;
    for (const image of [ ...images ].sort()) {
        const key = `${request.stack}::${image}`;
        const previous = Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : undefined;
        if (request.preserveExisting && previous) {
            preserved++;
            continue;
        }
        const after = request.mode === "scheduled" ? `scheduled@${request.time}` : request.mode;
        const before = previous ? (previous.mode === "scheduled" ? `scheduled@${previous.time ?? "02:00"}` : previous.mode) : "off";
        // Replacing a policy also clears its individual pause; preserving keeps it intact.
        if (before === after && (!previous || !previous.pause?.enabled)) {
            unchanged++;
            continue;
        }
        changes.push({ key,
            image,
            before,
            after });
    }
    const previewToken = createHash("sha256").update(JSON.stringify({
        stack: request.stack,
        mode: request.mode,
        time: request.time ?? null,
        preserveExisting: request.preserveExisting,
        services,
        entries: [ ...images ].sort().map(image => [ image, entries[`${request.stack}::${image}`] ?? null ]),
    })).digest("hex");
    return {
        stack: request.stack,
        mode: request.mode,
        ...(request.mode === "scheduled" ? { time: request.time } : {}),
        preserveExisting: request.preserveExisting,
        previewToken,
        eligible: images.size,
        excludedServices,
        noImageServices,
        sharedImageServices,
        preserved,
        changed: changes.length,
        unchanged,
        changes,
    };
}
