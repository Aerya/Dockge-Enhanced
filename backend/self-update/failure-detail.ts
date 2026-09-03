export type SelfUpdateFailureKind =
    | "network-timeout"
    | "registry-auth"
    | "registry-forbidden"
    | "image-not-found"
    | "dns"
    | "generic";

export function classifySelfUpdateFailure(raw: string): SelfUpdateFailureKind {
    const text = raw.toLowerCase();

    if (
        text.includes("timeout awaiting response headers")
        || text.includes("context deadline exceeded")
        || text.includes("i/o timeout")
        || text.includes("connection timed out")
    ) return "network-timeout";

    if (
        text.includes("status code 401")
        || text.includes("unauthorized")
        || text.includes("authentication required")
    ) return "registry-auth";

    if (
        text.includes("status code 403")
        || text.includes("denied:")
        || text.includes("requested access to the resource is denied")
    ) return "registry-forbidden";

    if (
        text.includes("status code 404")
        || text.includes("manifest unknown")
        || text.includes("not found")
    ) return "image-not-found";

    if (
        text.includes("no such host")
        || text.includes("temporary failure in name resolution")
        || text.includes("name or service not known")
    ) return "dns";

    return "generic";
}
