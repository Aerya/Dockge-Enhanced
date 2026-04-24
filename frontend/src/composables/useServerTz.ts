/**
 * useServerTz — récupère le fuseau horaire du serveur une seule fois
 * et expose fmtDate() pour formater les dates dans ce fuseau.
 */

import { ref } from "vue";

const serverTz = ref<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
let fetched = false;

export async function initServerTz(apiFn: (method: string, path: string) => Promise<any>): Promise<void> {
    if (fetched) return;
    fetched = true;
    try {
        const res = await apiFn("GET", "/server-tz");
        if (res?.ok && res.tz) serverTz.value = res.tz;
    } catch { /* garde le fuseau navigateur par défaut */ }
}

export function fmtDate(isoOrTs: string | number | Date): string {
    try {
        return new Date(isoOrTs).toLocaleString(undefined, { timeZone: serverTz.value });
    } catch {
        return new Date(isoOrTs).toLocaleString();
    }
}
