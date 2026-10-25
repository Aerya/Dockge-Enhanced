export interface OidcRedirect {
    code?: string;
    error?: string;
}

/**
 * Read the result the OIDC callback puts in the URL fragment
 * (`#oidc=<one-time code>` or `#oidcError=<i18n key>`).
 */
export function parseOidcRedirect(hash: string): OidcRedirect | null {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const code = params.get("oidc");
    if (code && /^[A-Za-z0-9_-]{16,128}$/.test(code)) {
        return { code };
    }
    const error = params.get("oidcError");
    if (error && /^[A-Za-z0-9_.]{1,64}$/.test(error)) {
        return { error };
    }
    return null;
}

/** Read the OIDC result once and remove it from the address bar and history. */
export function takeOidcRedirect(): OidcRedirect | null {
    const result = parseOidcRedirect(location.hash);
    if (result) {
        history.replaceState(history.state, "", location.pathname + location.search);
    }
    return result;
}
