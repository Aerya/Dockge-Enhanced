/** Conservative version hints: a tag is not a compatibility guarantee. */
export interface VersionTag {
    tag: string;
    parts: number[];
    variant: string;
}

export function parseVersionTag(tag: string): VersionTag | null {
    const match = /^v?(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?(-[a-z][a-z0-9.-]*)?$/.exec(tag);
    if (!match || /(?:^|[-.])(alpha|beta|rc|dev|nightly|preview|canary)(?:[-.\d]|$)/i.test(match[4] ?? "")) {
        return null;
    }
    const parts = match.slice(1, 4).filter(value => value !== undefined).map(Number);
    if (parts.some(value => !Number.isSafeInteger(value))) {
        return null;
    }
    return { tag,
        parts,
        variant: match[4] ?? "" };
}

function compare(a: VersionTag, b: VersionTag): number {
    for (let index = 0; index < 3; index++) {
        const difference = (a.parts[index] ?? 0) - (b.parts[index] ?? 0);
        if (difference) {
            return difference;
        }
    }
    return 0;
}

/** No guessed current version for floating tags, no variant or prerelease mixing. */
export function selectVersionCandidates(currentTag: string, tags: string[]): {
    current: VersionTag | null;
    sameMajor: string | null;
    nextMajor: string | null;
} {
    const current = parseVersionTag(currentTag);
    if (!current) {
        return { current: null,
            sameMajor: null,
            nextMajor: null };
    }
    const versions = [ ...new Set(tags) ].map(parseVersionTag)
        .filter((item): item is VersionTag => item !== null && item.variant === current.variant && item.parts.length === 3)
        .filter(item => compare(item, current) > 0).sort(compare);
    const same = versions.filter(item => item.parts[0] === current.parts[0]);
    const major = versions.find(item => item.parts[0] > current.parts[0])?.parts[0];
    const next = versions.filter(item => item.parts[0] === major);
    return { current,
        sameMajor: same.at(-1)?.tag ?? null,
        nextMajor: next.at(-1)?.tag ?? null };
}

export function versionAliasCandidates(tag: string, tags: string[]): string[] {
    const variant = parseVersionTag(tag)?.variant ?? (/^(latest|stable|lts)(-[a-z][a-z0-9.-]*)$/.exec(tag)?.[2] ?? "");
    return [ ...new Set(tags) ].map(parseVersionTag)
        .filter((item): item is VersionTag => item !== null && item.parts.length === 3 && item.variant === variant)
        .sort((a, b) => compare(b, a)).slice(0, 12).map(item => item.tag);
}

/** Never follow a pagination URL outside the authenticated repository. */
export function nextRegistryTagsPage(link: string, current: URL, first: URL): URL | null {
    const match = /<([^>]+)>\s*;\s*rel="?next"?(?:\s*[,;]|$)/i.exec(link);
    if (!match) {
        return null;
    }
    const next = new URL(match[1], current);
    if (next.origin !== first.origin || next.pathname !== first.pathname || next.username || next.password || next.hash) {
        throw new Error("Invalid registry pagination destination");
    }
    return next;
}
