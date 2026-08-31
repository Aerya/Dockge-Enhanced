import * as path from "node:path";
import type { SelfUpdateOperation } from "./types";

const TERMINAL_STATES = new Set<SelfUpdateOperation["state"]>([ "idle", "succeeded", "failed", "rolled-back", "rollback-failed" ]);
const REPOSITORY = /^[a-z0-9](?:[a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*$/;
const COMPOSE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export function isSelfUpdateActive(state: SelfUpdateOperation["state"]): boolean {
    return !TERMINAL_STATES.has(state);
}

export function normalizeSelfRepository(value: string): string {
    const repo = value.trim().toLowerCase().replace(/^ghcr\.io\//, "").replace(/\/$/, "");
    if (!REPOSITORY.test(repo) || !repo.endsWith("/dockge-enhanced")) throw new Error("Invalid Dockge-Enhanced repository");
    return repo;
}

export function imageRepository(image: string): string {
    const match = image.trim().match(/^ghcr\.io\/(.+?)(?::[a-z0-9._-]+|@sha256:[a-f0-9]{64})$/i);
    return match ? match[1].toLowerCase() : "";
}

export function isAllowedTargetImage(image: string, repository: string, testImages: string[] = []): boolean {
    if (testImages.includes(image)) return true;
    return imageRepository(image) === normalizeSelfRepository(repository);
}

export function isSafeComposeName(value: string): boolean {
    return COMPOSE_NAME.test(value);
}

export function isPathInside(root: string, candidate: string): boolean {
    if (!path.isAbsolute(root) || !path.isAbsolute(candidate)) return false;
    const relative = path.relative(root, candidate);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
