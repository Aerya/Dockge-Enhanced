type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Translate known Enhanced messages only; never rewrite Docker output, paths or user text. */
export function localizeServerMessage(message: string, translate: Translate): string {
    const exact = translate(message);
    if (exact !== message) {
        return exact;
    }
    const required = /^([a-zA-Z][a-zA-Z0-9_, ]*(?: et [a-zA-Z]+)?) requis(.*)$/.exec(message);
    if (required) {
        return translate("serverMessage.required", { fields: required[1],
            detail: required[2] });
    }
    const network = /^Réseau utilisé par (\d+) conteneur\(s\)$/.exec(message);
    if (network) {
        return translate("serverMessage.networkUsed", { count: Number(network[1]) });
    }
    return message;
}

export function localizeServerResponse<T>(response: T, translate: Translate): T {
    if (!response || typeof response !== "object" || Array.isArray(response)) {
        return response;
    }
    const result = { ...response } as Record<string, unknown>;
    for (const key of [ "msg", "message", "error" ]) {
        if (typeof result[key] === "string") {
            result[key] = localizeServerMessage(result[key], translate);
        }
    }
    return result as T;
}
