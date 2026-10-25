// A Host is an authority, not a URL. Reject credentials, paths, whitespace,
// forwarded-header lists and URL parser backslash/percent-escape shortcuts.
const authority = /^(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::[0-9]{1,5})?$/i;

export function isSocketOriginAllowed(host: string | undefined, origin: string | undefined): boolean {
    // Linked agents and non-browser clients do not send Origin. Authentication
    // remains mandatory elsewhere; preserve the existing federation policy.
    if (origin === undefined) {
        return true;
    }
    if (!host || !authority.test(host)) {
        return false;
    }
    const match = /^(https?):\/\/(.+)$/i.exec(origin);
    if (!match || !authority.test(match[2])) {
        return false;
    }
    try {
        const source = new URL(origin);
        // Use the browser's scheme only to resolve its default port. Do not
        // trust X-Forwarded-* or the internal HTTP transport behind a TLS proxy.
        const target = new URL(`${source.protocol}//${host}`);
        return source.hostname === target.hostname && source.port === target.port;
    } catch {
        return false;
    }
}
