import { composeLabelIsTrue } from "./compose-labels";
import { LABEL_RELAY } from "./rollout-relay";

export const LABEL_ROLLOUT = "dockge.rollout.enabled";
export const ROLLOUT_DRAIN_FILE = "/tmp/dockge-rollout-drain";
export const ROLLOUT_HEALTH_PREFIX = "test ! -f " + ROLLOUT_DRAIN_FILE + " && ";

export function rolloutEnabled(service: Record<string, unknown>): boolean {
    return composeLabelIsTrue(service.labels as Record<string, unknown> | unknown[] | undefined, LABEL_ROLLOUT);
}

/** Validate the resolved Compose, not just the editor draft. No silent fallback. */
export function rolloutProblems(service: Record<string, unknown>): string[] {
    const errors: string[] = [];
    const labels = service.labels as Record<string, unknown> | undefined;
    const relay = typeof labels?.[LABEL_RELAY] === "string" && !!labels[LABEL_RELAY];
    if (service.container_name) {
        errors.push("container_name");
    }
    if (Array.isArray(service.ports) && service.ports.length) {
        errors.push("ports");
    }
    if (service.network_mode) {
        errors.push("network_mode");
    }
    if (service.build || typeof service.image !== "string") {
        errors.push("image");
    }
    if (/dockge-enhanced|dockge-enhanced-updater/.test(String(service.image))) {
        errors.push("self-update");
    }
    const health = service.healthcheck as { disable?: boolean;
        test?: unknown[] } | undefined;
    if (!health || health.disable || !Array.isArray(health.test) || !health.test.length || health.test[0] === "NONE") {
        errors.push("healthcheck");
    }
    if (!relay && (health?.test?.[0] !== "CMD-SHELL" || typeof health.test[1] !== "string" || !health.test[1].startsWith(ROLLOUT_HEALTH_PREFIX))) {
        errors.push("healthcheck-draining");
    }
    // Conservative: shared writable data requires application-specific coordination.
    if (Array.isArray(service.volumes) && service.volumes.some(volume => !volume || typeof volume !== "object" || !(volume as { read_only?: boolean }).read_only)) {
        errors.push("volumes");
    }
    if (service.volumes_from || service.devices || service.privileged) {
        errors.push("shared-resources");
    }
    if (service.ipc || service.pid) {
        errors.push("namespace");
    }
    const networks = service.networks as Record<string, { ipv4_address?: string;
        ipv6_address?: string;
        mac_address?: string }> | undefined;
    if (networks && !Array.isArray(networks) && Object.values(networks).some(net => net && (net.ipv4_address || net.ipv6_address || net.mac_address))) {
        errors.push("static-address");
    }
    if (service.mac_address) {
        errors.push("static-address");
    }
    if (labels && Object.keys(labels).some(key => key.startsWith("plugNPiN."))) {
        errors.push("plugnpin-labels-must-belong-to-stable-relay");
    }
    const environment = service.environment as Record<string, unknown> | undefined;
    if (relay && ((labels && (labels["traefik.enable"] === "true" || Object.keys(labels).some(key => /^caddy(?:[._]|$)/.test(key)))) || environment?.VIRTUAL_HOST)) {
        errors.push("proxy-discovery-must-target-relay-not-application");
    }
    if (!relay && (!labels || labels["traefik.enable"] !== "true" ||
        !Object.keys(labels).some(key => /^traefik\.http\.routers\.[^.]+\.rule$/.test(key)) ||
        !Object.keys(labels).some(key => /^traefik\.http\.services\.[^.]+\.loadbalancer\.server\.port$/.test(key)))) {
        errors.push("traefik");
    }
    return errors;
}
