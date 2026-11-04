export interface EnvLine { raw: string;
    ending: string;
    key?: string;
    value?: string;
    prefix?: string }

/** Keep unsupported/multiline syntax as raw text; never reinterpret quotes or interpolation. */
export function parseEnvForm(text: string): EnvLine[] {
    const hasClosingQuote = (value: string, delimiter: string): boolean => {
        let escaped = false;
        for (const character of value) {
            if (!escaped && character === delimiter) {
                return true;
            }
            escaped = !escaped && character === "\\";
        }
        return false;
    };
    const lines: EnvLine[] = [];
    let quote: string | null = null;
    for (const part of text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? []) {
        if (!part) {
            continue;
        }
        const ending = part.match(/(?:\r\n|\n|\r)$/)?.[0] ?? "";
        const raw = ending ? part.slice(0, -ending.length) : part;
        const match: RegExpMatchArray | null = quote ? null : raw.match(/^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=)(.*)$/);
        const value: string = match ? match[4] : raw;
        const opening: string = value.trimStart()[0];
        if (quote) {
            if (hasClosingQuote(raw, quote)) {
                quote = null;
            }
        } else if ((opening === "'" || opening === "\"") && !hasClosingQuote(value.trimStart().slice(1), opening)) {
            quote = opening;
        } else if (match) {
            lines.push({ raw,
                ending,
                key: match[2],
                value,
                prefix: match[1] + match[2] + match[3] });
            continue;
        }
        lines.push({ raw,
            ending });
    }
    return lines;
}

export function editEnvValue(text: string, index: number, value: string): string {
    if (/[\r\n\0]/.test(value)) {
        throw new Error("Invalid environment value");
    }
    const lines = parseEnvForm(text);
    const line = lines[index];
    if (!line?.prefix) {
        throw new Error("Unsupported environment syntax");
    }
    line.raw = line.prefix + value;
    return lines.map(item => item.raw + item.ending).join("");
}
