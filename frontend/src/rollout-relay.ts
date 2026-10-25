import { composeLabelValue, setComposeLabel } from "../../common/compose-labels";
import { LABEL_ROLLOUT } from "../../common/service-rollout";
import { LABEL_RELAY, LABEL_RELAY_OWNER, LABEL_RELAY_PORT, RELAY_CONFIG, RELAY_IMAGE, relayConfig } from "../../common/rollout-relay";

type Service = Record<string, unknown>;
interface Compose { services: Record<string, Service>;
    volumes?: Record<string, unknown>;
    networks?: Record<string, unknown> }

/** Explicit draft-only migration. Never deploys, rewrites .env or touches a proxy API. */
export function addRolloutRelay(input: Compose, name: string, port: number): Compose {
    const result = structuredClone(input);
    const app = result.services[name];
    const relay = name + "-rollout-relay";
    const volume = relay + "-config";
    if (!app || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/.test(name) || result.services[relay] || result.volumes?.[volume] || result.networks?.[relay] ||
        app.container_name || app.network_mode || app.profiles || app.extends ||
        composeLabelValue(app.labels as Record<string, unknown>, LABEL_RELAY)) {
        throw new Error("serviceRollout.relayInvalid");
    }
    const health = app.healthcheck as { disable?: boolean;
        test?: unknown[] } | undefined;
    if (!health || health.disable || !Array.isArray(health.test) || ![ "CMD", "CMD-SHELL" ].includes(String(health.test[0]))) {
        throw new Error("serviceRollout.relayInvalid");
    }
    const origin = "${COMPOSE_PROJECT_NAME}-" + name + "-rollout-origin";
    const config = relayConfig([ "rollout-origin-placeholder" ], port).replaceAll("rollout-origin-placeholder", origin);
    // Require an unambiguous TCP port; never expand variables, ranges or UDP.
    if (Array.isArray(app.ports) && app.ports.some(value => {
        if (value && typeof value === "object") {
            const mapping = value as Record<string, unknown>;
            return Number(mapping.target) !== port || (mapping.protocol && mapping.protocol !== "tcp");
        }
        return !/^[0-9.:[\]]+(?:\/tcp)?$/.test(String(value)) || Number(String(value).replace(/\/tcp$/, "").split(":").at(-1)) !== port;
    })) {
        throw new Error("serviceRollout.relayInvalid");
    }
    const relayLabels: Record<string, string> = {
        [LABEL_RELAY_OWNER]: name,
        [LABEL_RELAY_PORT]: String(port),
        "dockge.imageupdates.check": "false",
    };
    const keys = Array.isArray(app.labels) ? app.labels.filter(value => typeof value === "string").map(value => value.split("=")[0]) : Object.keys((app.labels ?? {}) as object);
    const virtualHost = Array.isArray(app.environment) ? app.environment.some(value => /^VIRTUAL_HOST=.+/.test(String(value))) :
        (app.environment as Record<string, unknown> | undefined)?.VIRTUAL_HOST;
    if (keys.some(key => /^caddy(?:[._]|$)/.test(key)) || virtualHost) {
        throw new Error("serviceRollout.relayInvalid");
    }
    for (const key of keys) {
        if (key.startsWith("plugNPiN.") || key.startsWith("traefik.")) {
            relayLabels[key] = String(composeLabelValue(app.labels as Record<string, unknown>, key));
            setComposeLabel(app, key, null);
        }
    }
    setComposeLabel(app, LABEL_RELAY, relay);
    setComposeLabel(app, LABEL_ROLLOUT, "true");
    const networks = Array.isArray(app.networks) ? app.networks : app.networks ? Object.keys(app.networks as object) : [ "default" ];
    app.networks = {
        ...(app.networks && !Array.isArray(app.networks) ? app.networks as Record<string, unknown> : Object.fromEntries(networks.map(network => [ network, {}]))),
        [relay]: { aliases: [ origin ] },
    };
    result.networks = { ...result.networks,
        ...(!input.services[name].networks && !result.networks?.default ? { default: {} } : {}),
        [relay]: {} };
    result.services[relay] = {
        image: RELAY_IMAGE,
        restart: "unless-stopped",
        entrypoint: [ "/bin/sh", "-ec" ],
        // A persisted route may address replicas removed by a later down/up.
        // Keep a valid route on restart, but recover an invalid one from the
        // Compose-owned bootstrap instead of restarting forever on stale DNS.
        command: [ `if ! test -s ${RELAY_CONFIG} || ! nginx -t -c ${RELAY_CONFIG}; then printf '%s' "$$DOCKGE_RELAY_BOOTSTRAP" > ${RELAY_CONFIG}.next; nginx -t -c ${RELAY_CONFIG}.next; mv ${RELAY_CONFIG}.next ${RELAY_CONFIG}; fi; exec nginx -c ${RELAY_CONFIG} -g 'daemon off;'` ],
        environment: { DOCKGE_RELAY_BOOTSTRAP: config },
        labels: relayLabels,
        ...(app.ports ? { ports: app.ports } : {}),
        networks: [ ...networks, relay ],
        depends_on: { [name]: { condition: "service_healthy" } },
        volumes: [ `${volume}:/etc/dockge-relay` ],
        read_only: true,
        tmpfs: [ "/tmp", "/var/cache/nginx" ],
        cap_drop: [ "ALL" ],
        cap_add: [ "NET_BIND_SERVICE", "SETUID", "SETGID" ],
        security_opt: [ "no-new-privileges:true" ],
        healthcheck: { test: [ "CMD", "nginx", "-t", "-c", RELAY_CONFIG ],
            interval: "10s",
            timeout: "5s",
            retries: 3 },
    };
    delete app.ports;
    result.volumes = { ...result.volumes,
        [volume]: {} };
    return result;
}
