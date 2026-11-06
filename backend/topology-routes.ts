import { safeServiceUrl } from "../common/service-links";

export interface TopologyWebRoute {
    url: string;
    source: "Traefik" | "PlugNPiN";
    targetPort?: number;
}

/** Declarations only: never contact URLs or return middleware/authentication labels. */
export function topologyRoutes(labels: Record<string, string>): TopologyWebRoute[] {
    const routes: TopologyWebRoute[] = [];
    const add = (value: string, source: TopologyWebRoute["source"], target?: string) => {
        const url = safeServiceUrl(value);
        if (!url || new URL(url).search || new URL(url).hash || routes.length >= 100) {
            return;
        }
        const targetPort = Number(target);
        routes.push({ url,
            source,
            ...(Number.isInteger(targetPort) && targetPort > 0 && targetPort <= 65535 ? { targetPort } : {}) });
    };
    for (const domain of (labels["plugNPiN.url"] || "").split(",").slice(0, 100)) {
        if (/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(domain.trim())) {
            add("http://" + domain.trim(), "PlugNPiN");
        }
    }
    if (labels["traefik.enable"] === "false") {
        return routes;
    }
    for (const [ key, rule ] of Object.entries(labels)) {
        const match = /^traefik\.http\.routers\.([a-z0-9_-]+)\.rule$/i.exec(key);
        // Do not turn negated hosts, regexes or path-dependent rules into guessed links.
        if (!match || !/^Host\(`[^`]+`(?:\s*,\s*`[^`]+`)*\)$/.test(rule)) {
            continue;
        }
        const prefix = `traefik.http.routers.${match[1]}`;
        const service = labels[`${prefix}.service`];
        const target = service ? labels[`traefik.http.services.${service}.loadbalancer.server.port`] : undefined;
        const scheme = labels[`${prefix}.tls`] === "true" || labels[`${prefix}.tls.certresolver`] ? "https" : "http";
        for (const host of rule.matchAll(/`([^`]+)`/g)) {
            if (/^[a-z0-9.-]+$/i.test(host[1])) {
                add(`${scheme}://${host[1]}`, "Traefik", target);
            }
        }
    }
    return routes;
}

// Filter in Docker's formatter, before output enters Enhanced. No raw label map or secrets.
export const topologyRouteLabelsFormat = "{\"plugNPiN.url\":{{json (index .Config.Labels \"plugNPiN.url\")}},\"traefik.enable\":{{json (index .Config.Labels \"traefik.enable\")}}{{range $k, $v := .Config.Labels}}{{$p := split $k \".\"}}{{if and (ge (len $p) 5) (eq (index $p 0) \"traefik\") (eq (index $p 1) \"http\")}}{{if or (and (eq (index $p 2) \"routers\") (or (and (eq (len $p) 5) (or (eq (index $p 4) \"rule\") (eq (index $p 4) \"service\") (eq (index $p 4) \"tls\"))) (and (eq (len $p) 6) (eq (index $p 4) \"tls\") (eq (index $p 5) \"certresolver\")))) (and (eq (len $p) 7) (eq (index $p 2) \"services\") (eq (index $p 4) \"loadbalancer\") (eq (index $p 5) \"server\") (eq (index $p 6) \"port\"))}},{{json $k}}:{{json $v}}{{end}}{{end}}{{end}}}";
