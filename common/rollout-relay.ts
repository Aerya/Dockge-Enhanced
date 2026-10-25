/** Stable TCP ingress. No Docker socket, API credentials or TLS termination. */
export const RELAY_IMAGE = "nginx:stable-alpine@sha256:47928bf67eb62a1863cb08d9ecb52d3e704304ba614eaee17884204677702951";
export const LABEL_RELAY = "dockge.rollout.relay";
export const LABEL_RELAY_OWNER = "dockge.rollout.owner";
export const LABEL_RELAY_PORT = "dockge.rollout.port";
export const RELAY_CONFIG = "/etc/dockge-relay/nginx.conf";
export const RELAY_SIGNATURE = "# Dockge-Enhanced managed TCP relay v1";

export function relayConfig(hosts: string[], port: number): string {
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !hosts.length || hosts.length > 16 ||
        hosts.some(host => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(host))) {
        throw new Error("Invalid relay endpoints");
    }
    return [
        RELAY_SIGNATURE,
        "worker_processes 1;",
        "pid /tmp/nginx.pid;",
        "error_log /dev/stderr warn;",
        "events { worker_connections 4096; }",
        "stream {",
        "  resolver 127.0.0.11 valid=5s ipv6=off;",
        "  upstream application {",
        "    zone application 64k;",
        ...hosts.map(host => `    server ${host}:${port} resolve;`),
        // Dynamic DNS starts asynchronously in a fresh worker. A synchronously
        // resolved backup prevents an empty upstream pool during that window.
        ...hosts.map(host => `    server ${host}:${port} backup;`),
        "  }",
        `  server { listen ${port}; proxy_pass application; proxy_connect_timeout 5s; proxy_timeout 24h; }`,
        "}",
        "",
    ].join("\n");
}
