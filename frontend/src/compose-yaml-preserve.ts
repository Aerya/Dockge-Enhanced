import { isMap, isScalar, isSeq, parseDocument } from "yaml";

/**
 * Preserve YAML 1.1-style octal tmpfs.mode literals (e.g. 01777)
 * when the visual Compose editor rebuilds YAML from its JS object.
 *
 * The structured editor necessarily loses the original scalar spelling.
 * Docker Compose expects tmpfs.mode as an octal permission value, so
 * rewriting 01777 as 1777 changes its meaning.
 */

interface TmpfsModeLiteral {
    value: string;
}

function leadingIndent(line: string): number {
    return line.match(/^[ \t]*/)?.[0].length ?? 0;
}

function collectTmpfsModeLiterals(yaml: string): TmpfsModeLiteral[] {
    const lines = yaml.split(/\r?\n/);
    const modes: TmpfsModeLiteral[] = [];
    let tmpfsIndent: number | null = null;

    for (const line of lines) {
        if (/^\s*(?:#.*)?$/.test(line)) {
            continue;
        }

        const indent = leadingIndent(line);

        if (tmpfsIndent !== null && indent <= tmpfsIndent) {
            tmpfsIndent = null;
        }

        const tmpfsMatch = line.match(/^([ \t]*)tmpfs:\s*(?:#.*)?$/);
        if (tmpfsMatch) {
            tmpfsIndent = tmpfsMatch[1].length;
            continue;
        }

        if (tmpfsIndent === null || indent <= tmpfsIndent) {
            continue;
        }

        const modeMatch = line.match(/^[ \t]*mode:\s*(0[0-7]+)(?:\s*(?:#.*)?)?$/);
        if (modeMatch) {
            modes.push({ value: modeMatch[1] });
        }
    }

    return modes;
}

export function preserveTmpfsModeLiterals(originalYAML: string, generatedYAML: string): string {
    generatedYAML = preserveServiceFileModes(originalYAML, generatedYAML);
    const originals = collectTmpfsModeLiterals(originalYAML);
    if (originals.length === 0) {
        return generatedYAML;
    }

    const lines = generatedYAML.split(/\r?\n/);
    const generatedModeIndexes: number[] = [];
    let tmpfsIndent: number | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/^\s*(?:#.*)?$/.test(line)) {
            continue;
        }

        const indent = leadingIndent(line);

        if (tmpfsIndent !== null && indent <= tmpfsIndent) {
            tmpfsIndent = null;
        }

        const tmpfsMatch = line.match(/^([ \t]*)tmpfs:\s*(?:#.*)?$/);
        if (tmpfsMatch) {
            tmpfsIndent = tmpfsMatch[1].length;
            continue;
        }

        if (tmpfsIndent === null || indent <= tmpfsIndent) {
            continue;
        }

        if (/^[ \t]*mode:\s*[0-9]+(?:\s*(?:#.*)?)?$/.test(line)) {
            generatedModeIndexes.push(i);
        }
    }

    // If the visual edit changed the number of tmpfs.mode entries,
    // do not guess which value belongs where.
    if (generatedModeIndexes.length !== originals.length) {
        return generatedYAML;
    }

    generatedModeIndexes.forEach((lineIndex, index) => {
        lines[lineIndex] = lines[lineIndex].replace(
            /^([ \t]*mode:\s*)[0-9]+(\s*(?:#.*)?)$/,
            `$1${originals[index].value}$2`
        );
    });

    return lines.join(generatedYAML.includes("\r\n") ? "\r\n" : "\n");
}

/** Preserve unchanged configs/secrets permissions by service and source/target,
 * not list position: visual edits can reorder or remove mounts. */
function preserveServiceFileModes(originalYAML: string, generatedYAML: string): string {
    const original = parseDocument(originalYAML);
    const generated = parseDocument(generatedYAML);
    if (original.errors.length || generated.errors.length) {
        return generatedYAML;
    }
    const services = generated.get("services", true);
    if (!isMap(services)) {
        return generatedYAML;
    }
    const replacements: Array<{ start: number;
        end: number;
        value: string }> = [];
    for (const service of services.items) {
        if (!isScalar(service.key) || !isMap(service.value)) {
            continue;
        }
        for (const kind of [ "configs", "secrets" ]) {
            const entries = service.value.get(kind, true);
            const previous = original.getIn([ "services", service.key.value, kind ], true);
            if (!isSeq(entries) || !isSeq(previous)) {
                continue;
            }
            for (const entry of entries.items) {
                if (!isMap(entry)) {
                    continue;
                }
                const matches = previous.items.filter(item => isMap(item) &&
                    item.get("source") === entry.get("source") && item.get("target") === entry.get("target"));
                if (matches.length !== 1 || !isMap(matches[0])) {
                    continue;
                }
                const oldMode = matches[0].get("mode", true);
                const mode = entry.get("mode", true);
                if (isScalar(oldMode) && isScalar(mode) && typeof mode.value === "number" &&
                    mode.value === oldMode.value && /^0[0-7]+$/.test(oldMode.source ?? "") && mode.range) {
                    replacements.push({ start: mode.range[0],
                        end: mode.range[1],
                        value: oldMode.source! });
                }
            }
        }
    }
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
        generatedYAML = generatedYAML.slice(0, replacement.start) + replacement.value + generatedYAML.slice(replacement.end);
    }
    return generatedYAML;
}


interface QuotedScalarStyle {
    value: unknown;
    type: "QUOTE_DOUBLE" | "QUOTE_SINGLE";
}

type YamlNode = unknown;

function scalarPathKey(path: Array<string | number>): string {
    return JSON.stringify(path);
}

function collectQuotedScalarStyles(node: YamlNode, path: Array<string | number>, styles: Map<string, QuotedScalarStyle>) {
    if (isScalar(node)) {
        if ((node.type === "QUOTE_DOUBLE" || node.type === "QUOTE_SINGLE") && typeof node.value === "string") {
            styles.set(scalarPathKey(path), {
                value: node.value,
                type: node.type,
            });
        }
        return;
    }

    if (isSeq(node)) {
        node.items.forEach((item: YamlNode, index: number) => collectQuotedScalarStyles(item, [ ...path, index ], styles));
        return;
    }

    if (isMap(node)) {
        for (const pair of node.items) {
            const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
            collectQuotedScalarStyles(pair.value, [ ...path, key ], styles);
        }
    }
}

function restoreQuotedScalarStyles(node: YamlNode, path: Array<string | number>, styles: Map<string, QuotedScalarStyle>) {
    if (isScalar(node)) {
        const original = styles.get(scalarPathKey(path));
        if (original && typeof node.value === "string" && node.value === original.value) {
            node.type = original.type;
        }
        return;
    }

    if (isSeq(node)) {
        node.items.forEach((item: YamlNode, index: number) => restoreQuotedScalarStyles(item, [ ...path, index ], styles));
        return;
    }

    if (isMap(node)) {
        for (const pair of node.items) {
            const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
            restoreQuotedScalarStyles(pair.value, [ ...path, key ], styles);
        }
    }
}

/**
 * Restore single/double-quote style for unchanged scalar values after the
 * visual editor rebuilt the document from JSON. Also serializes with
 * lineWidth=0 so long Compose values such as bind mounts are never folded
 * onto continuation lines merely because they contain spaces.
 */
export function preserveQuotedScalarStyles(originalYAML: string, generatedYAML: string): string {
    const originalDoc = parseDocument(originalYAML);
    const generatedDoc = parseDocument(generatedYAML);

    if (originalDoc.errors.length > 0 || generatedDoc.errors.length > 0 || !originalDoc.contents || !generatedDoc.contents) {
        return generatedYAML;
    }

    const styles = new Map<string, QuotedScalarStyle>();
    collectQuotedScalarStyles(originalDoc.contents, [], styles);
    if (styles.size === 0) {
        return generatedDoc.toString({ lineWidth: 0 });
    }

    restoreQuotedScalarStyles(generatedDoc.contents, [], styles);
    return generatedDoc.toString({ lineWidth: 0 });
}
