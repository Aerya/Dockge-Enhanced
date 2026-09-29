import { parseDocument } from "yaml";
import { preserveTmpfsModeLiterals } from "./compose-yaml-preserve";

const TOP_LEVEL_KEYS = new Set([
    "name", "version", "services", "networks", "volumes", "configs", "secrets", "include",
]);

const SERVICE_KEYS = new Set([
    "attach", "build", "blkio_config", "cap_add", "cap_drop", "cgroup", "cgroup_parent", "command",
    "configs", "container_name", "credential_spec", "depends_on", "deploy", "develop", "device_cgroup_rules",
    "devices", "dns", "dns_opt", "dns_search", "domainname", "entrypoint", "env_file", "environment", "expose",
    "extends", "external_links", "extra_hosts", "group_add", "healthcheck", "hostname", "image", "init", "ipc",
    "isolation", "labels", "links", "logging", "mac_address", "mem_limit", "mem_reservation", "mem_swappiness",
    "memswap_limit", "network_mode", "networks", "oom_kill_disable", "oom_score_adj", "pid", "pids_limit",
    "platform", "ports", "post_start", "pre_stop", "privileged", "profiles", "pull_policy", "read_only", "restart",
    "runtime", "scale", "security_opt", "shm_size", "stdin_open", "stop_grace_period", "stop_signal", "storage_opt",
    "sysctls", "tmpfs", "tty", "ulimits", "use_api_socket", "user", "userns_mode", "uts", "volumes",
    "volume_driver", "volumes_from", "working_dir",
]);

const HEALTHCHECK_KEYS = new Set([
    "test", "interval", "timeout", "retries", "start_period", "start_interval", "disable",
]);

const SERVICE_COLLECTION_KEYS = new Set([
    "cap_add", "cap_drop", "configs", "depends_on", "device_cgroup_rules", "devices", "dns", "dns_opt", "dns_search",
    "env_file", "environment", "expose", "external_links", "extra_hosts", "group_add", "labels", "links", "networks",
    "ports", "profiles", "security_opt", "sysctls", "tmpfs", "ulimits", "volumes", "volumes_from",
]);

const SERVICE_MAPPING_KEYS = new Set([
    "blkio_config", "build", "credential_spec", "deploy", "develop", "healthcheck", "logging", "storage_opt",
]);

function mappingKey(content: string): { key: string; emptyValue: boolean } | null {
    if (content.startsWith("- ") || content.startsWith("-") || content.startsWith("#")) {
        return null;
    }

    const match = content.match(/^([^:#][^:]*?):(?:\s*(.*))?$/);
    if (!match) {
        return null;
    }

    const key = match[1].trim().replace(/^['"]|['"]$/g, "");
    const value = (match[2] ?? "").trim();
    return { key, emptyValue: value === "" || value.startsWith("#") };
}

function nextMeaningfulLine(lines: string[], start: number): string | null {
    for (let i = start + 1; i < lines.length; i += 1) {
        const content = lines[i].trim();
        if (content !== "" && !content.startsWith("#")) {
            return content;
        }
    }
    return null;
}

function looksLikeServiceDeclaration(lines: string[], index: number, key: string, emptyValue: boolean, currentService: string | null): boolean {
    if (!emptyValue || SERVICE_KEYS.has(key) || TOP_LEVEL_KEYS.has(key) || key.startsWith("x-")) {
        return false;
    }

    const next = nextMeaningfulLine(lines, index);
    const nextKey = next ? mappingKey(next) : null;

    // A service name is followed, in normal Compose files, by one of the known service attributes.
    if (nextKey && SERVICE_KEYS.has(nextKey.key)) {
        return true;
    }

    // First mapping directly below services: is also very likely a service declaration.
    return currentService === null;
}

function repairComposeIndentationCandidate(source: string): string {
    const lines = source.replace(/\t/g, "  ").split(/\r?\n/);
    const output: string[] = [];

    let section: string | null = null;
    let currentService: string | null = null;
    let currentServiceProperty: string | null = null;
    let currentNestedKey: string | null = null;
    let previousCodeIndent = 0;
    let previousOriginalIndent = 0;
    let previousOpenedContainer = false;

    for (let index = 0; index < lines.length; index += 1) {
        const raw = lines[index];
        const content = raw.trimStart();
        const originalIndent = raw.length - content.length;

        if (content === "") {
            output.push("");
            continue;
        }

        if (content.startsWith("#")) {
            // Comments do not affect YAML structure. Align them with the block they describe.
            const next = nextMeaningfulLine(lines, index);
            const nextKey = next ? mappingKey(next) : null;
            let commentIndent = section ? 2 : 0;
            if (section === "services" && currentService) {
                if (nextKey && SERVICE_KEYS.has(nextKey.key)) {
                    commentIndent = 4;
                } else if (currentNestedKey) {
                    commentIndent = 8;
                } else if (currentServiceProperty && (SERVICE_COLLECTION_KEYS.has(currentServiceProperty) || SERVICE_MAPPING_KEYS.has(currentServiceProperty))) {
                    commentIndent = 6;
                } else {
                    commentIndent = 4;
                }
            }
            output.push(`${" ".repeat(commentIndent)}${content}`);
            continue;
        }

        const keyInfo = mappingKey(content);
        let indent: number | null = null;
        let openedContainer = false;

        if (keyInfo && (TOP_LEVEL_KEYS.has(keyInfo.key) || keyInfo.key.startsWith("x-")) && originalIndent <= 2) {
            indent = 0;
            section = keyInfo.key;
            currentService = null;
            currentServiceProperty = null;
            currentNestedKey = null;
            openedContainer = keyInfo.emptyValue;
        } else if (section === "services") {
            if (keyInfo && looksLikeServiceDeclaration(lines, index, keyInfo.key, keyInfo.emptyValue, currentService)) {
                indent = 2;
                currentService = keyInfo.key;
                currentServiceProperty = null;
                currentNestedKey = null;
                openedContainer = true;
            } else if (keyInfo && SERVICE_KEYS.has(keyInfo.key)) {
                indent = 4;
                currentServiceProperty = keyInfo.key;
                currentNestedKey = null;
                openedContainer = keyInfo.emptyValue;
            } else if (keyInfo && currentServiceProperty === "healthcheck" && HEALTHCHECK_KEYS.has(keyInfo.key)) {
                indent = 6;
                currentNestedKey = keyInfo.key;
                openedContainer = keyInfo.emptyValue;
            } else if (content.startsWith("-")) {
                if (currentServiceProperty === "healthcheck" && currentNestedKey === "test") {
                    indent = 8;
                } else if (currentServiceProperty && (SERVICE_COLLECTION_KEYS.has(currentServiceProperty) || SERVICE_MAPPING_KEYS.has(currentServiceProperty))) {
                    indent = 6;
                }
            } else if (keyInfo && currentServiceProperty) {
                // Generic nested mapping under a known service block (build, deploy, logging, networks, etc.).
                // Relative indentation is preserved when it is coherent; obvious one-space drift is normalized.
                if (previousOpenedContainer) {
                    indent = previousCodeIndent + 2;
                } else if (originalIndent > previousOriginalIndent) {
                    indent = previousCodeIndent + 2;
                } else if (originalIndent === previousOriginalIndent) {
                    indent = previousCodeIndent;
                } else {
                    indent = Math.max(6, previousCodeIndent - 2);
                }
                currentNestedKey = keyInfo.key;
                openedContainer = keyInfo.emptyValue;
            }
        }

        if (indent === null) {
            // Conservative generic fallback: preserve hierarchy while snapping indentation to two-space levels.
            if (previousOpenedContainer && originalIndent > previousOriginalIndent) {
                indent = previousCodeIndent + 2;
            } else if (originalIndent === previousOriginalIndent) {
                indent = previousCodeIndent;
            } else {
                indent = Math.max(0, Math.round(originalIndent / 2) * 2);
            }
        }

        output.push(`${" ".repeat(indent)}${content}`);
        previousCodeIndent = indent;
        previousOriginalIndent = originalIndent;
        previousOpenedContainer = openedContainer;
    }

    return output.join("\n");
}

export function formatComposeYAML(source: string): string {
    const doc = parseDocument(source);

    if (doc.errors.length > 0) {
        throw doc.errors[0];
    }

    const formatted = doc.toString({
        indent: 2,
        indentSeq: true,
        lineWidth: 0,
    });

    return preserveTmpfsModeLiterals(source, formatted);
}

export function repairAndFormatComposeYAML(source: string): { yaml: string; repaired: boolean } {
    const originalDoc = parseDocument(source);

    if (originalDoc.errors.length === 0) {
        return { yaml: formatComposeYAML(source), repaired: false };
    }

    const repairedSource = repairComposeIndentationCandidate(source);
    const repairedDoc = parseDocument(repairedSource);

    if (repairedDoc.errors.length > 0) {
        const error = repairedDoc.errors[0];
        throw new Error(`Réparation automatique impossible : ${error.message}`);
    }

    return {
        yaml: formatComposeYAML(repairedSource),
        repaired: true,
    };
}
