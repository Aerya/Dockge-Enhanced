import fs from "node:fs";
import path from "node:path";
import type { PruneImageDecision } from "./watchers/auto-prune-manager";

export interface ImagePruneReport {
    id: string;
    origin: "manual" | "automatic";
    mode: "dangling" | "unused" | "all";
    finishedAt: string;
    examined: PruneImageDecision[];
    errors: string[];
}

function reportPath(): string {
    return path.join(process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data", "image-prune-reports.json");
}

export function readImagePruneReports(): ImagePruneReport[] {
    try {
        const parsed = JSON.parse(fs.readFileSync(reportPath(), "utf8")) as unknown;
        return Array.isArray(parsed) ? parsed as ImagePruneReport[] : [];
    } catch {
        return [];
    }
}

export function recordImagePruneReport(
    origin: ImagePruneReport["origin"],
    mode: ImagePruneReport["mode"],
    examined: PruneImageDecision[],
    errors: string[],
): ImagePruneReport {
    const report: ImagePruneReport = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        origin,
        mode,
        finishedAt: new Date().toISOString(),
        examined,
        errors,
    };
    const target = reportPath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify([ report, ...readImagePruneReports() ].slice(0, 20)), { mode: 0o600 });
    fs.renameSync(temporary, target);
    return report;
}
