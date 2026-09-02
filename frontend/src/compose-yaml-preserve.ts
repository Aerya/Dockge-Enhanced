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
