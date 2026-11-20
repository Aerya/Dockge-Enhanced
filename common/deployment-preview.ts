/** Strict sandbox transform: reject sharing rather than silently changing a production Compose. */
export function previewModel(input: unknown, project: string) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Preview requires a Compose object");
    }
    const model = input as Record<string, unknown>;
    if (Object.keys(model).some(key => key !== "services") || !model.services || typeof model.services !== "object" || Array.isArray(model.services)) {
        throw new Error("Preview accepts services only; external resources are forbidden");
    }
    const services = Object.entries(model.services);
    if (!services.length || services.length > 4) {
        throw new Error("Preview requires one to four services");
    }
    const allowed = [ "image", "command", "entrypoint", "environment", "healthcheck", "labels" ];
    const escaped = (value: unknown): unknown => typeof value === "string" ? value.replaceAll("$", () => "$$") : Array.isArray(value) ? value.map(escaped) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([ k, v ]) => [ k, escaped(v) ])) : value;
    return { name: project,
        services: Object.fromEntries(services.map(([ name, raw ]) => {
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name) || !raw || typeof raw !== "object" || Array.isArray(raw)) {
                throw new Error("Invalid preview service");
            }
            const service = raw as Record<string, unknown>;
            if (Object.keys(service).some(key => !allowed.includes(key))) {
                throw new Error("Preview refuses mounts, ports, host namespaces, builds, dependencies and privileges");
            }
            const environment = service.environment;
            if (Array.isArray(environment) ? environment.some(value => /^VIRTUAL_HOST(?:=|$)/.test(String(value))) : environment && typeof environment === "object" && "VIRTUAL_HOST" in environment) {
                throw new Error("Preview refuses proxy-discovery environment variables");
            }
            const labels = service.labels as Record<string, string> | undefined;
            if (!labels || labels["dockge.rollout.migrations"] !== "none" || Object.keys(labels).some(key => key !== "dockge.rollout.migrations") ||
            /(?:postgres|mysql|mariadb|mongo|redis|migrat)/i.test(String(service.image) + " " + JSON.stringify(service.command || "") + " " + JSON.stringify(service.entrypoint || ""))) {
                throw new Error("Preview requires migration-free services without publication labels");
            }
            if (typeof service.image !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,255}$/.test(service.image)) {
                throw new Error("Invalid preview image");
            }
            return [ name, { ...escaped(service) as Record<string, unknown>,
                labels: { "dockge.preview.project": project },
                restart: "no",
                read_only: true,
                cap_drop: [ "ALL" ],
                security_opt: [ "no-new-privileges:true" ],
                pids_limit: 64,
                mem_limit: "128m",
                cpus: 0.5,
                tmpfs: [ "/tmp:rw,noexec,nosuid,size=16m" ],
                network_mode: "none" }];
        })) };
}
