import { isMap, isSeq, parseDocument } from "yaml";

/** Work on detached documents: cancellation/errors never partially mutate the editor. */
export function prepareComposeTimezone(compose: string, override: string, timezone: string) {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    const conflicts = new Set<string>();
    const services = new Set<string>();
    const transform = (source: string, optional = false) => {
        if (!source.trim()) {
            if (!optional) {
                throw new Error("stackTimezone.invalid");
            }
            return source;
        }
        const doc = parseDocument(source, { merge: true });
        if (doc.errors.length) {
            throw new Error("stackTimezone.invalid");
        }
        const nodes = doc.get("services", true);
        if (nodes === undefined && optional) {
            return source;
        }
        if (!isMap(nodes)) {
            throw new Error("stackTimezone.invalid");
        }
        // Resolves inherited TZ values, without modifying shared anchors.
        const resolved = doc.toJS({ maxAliasCount: 100 }) as { services: Record<string, Record<string, unknown>> };
        for (const pair of nodes.items) {
            const name = String(pair.key);
            const service = pair.value;
            if (!isMap(service)) {
                throw new Error("stackTimezone.invalid");
            }
            services.add(name);
            const effective = resolved.services[name];
            const inherited = effective.environment;
            const hasTZ = Array.isArray(inherited)
                ? inherited.some(value => typeof value === "string" && /^(TZ=|TZ$)/.test(value))
                : !!inherited && typeof inherited === "object" && Object.hasOwn(inherited, "TZ");
            // env_file/extends may define TZ outside this draft: always request consent.
            if (hasTZ || effective.env_file || effective.extends) {
                conflicts.add(name);
            }
            const env = service.get("environment", true);
            if (isMap(env)) {
                env.set("TZ", timezone);
            } else if (isSeq(env)) {
                env.items = env.items.filter(item => !/^(TZ=|TZ$)/.test(String(item)));
                env.add(`TZ=${timezone}`);
            } else if (Array.isArray(inherited)) {
                service.set("environment", doc.createNode([ ...inherited.filter(value => !/^(TZ=|TZ$)/.test(String(value))), `TZ=${timezone}` ]));
            } else if (inherited === undefined || inherited === null || typeof inherited === "object") {
                service.set("environment", doc.createNode({ ...inherited as Record<string, unknown> | undefined,
                    TZ: timezone }));
            } else {
                throw new Error("stackTimezone.invalid");
            }
        }
        return doc.toString({ lineWidth: 0 });
    };
    const updatedCompose = transform(compose);
    const updatedOverride = transform(override, true);
    if (services.size === 0) {
        throw new Error("stackTimezone.invalid");
    }
    return { compose: updatedCompose,
        override: updatedOverride,
        conflicts: [ ...conflicts ],
        services: [ ...services ] };
}
