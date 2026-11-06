import { Document, isMap, isScalar, isSeq, parseDocument, type Node } from "yaml";

type Edit = { start: number;
    end: number;
    text: string };

function equal(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) {
        return true;
    }
    if (!a || !b || typeof a !== "object" || typeof b !== "object") {
        return false;
    }
    if (Array.isArray(a) !== Array.isArray(b)) {
        return false;
    }
    const left = Object.keys(a);
    const right = Object.keys(b);
    return left.length === right.length && left.every(key => Object.hasOwn(b, key)
        && equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Patch source ranges, never serialize unrelated YAML. Validate the complete result before returning. */
export function editComposeYAML(source: string, next: Record<string, unknown>): string {
    const doc = parseDocument(source, { keepSourceTokens: true });
    if (doc.errors.length) {
        throw doc.errors[0];
    }
    const original = doc.toJS() ?? {};
    const target = { ...next };
    // UI-only empty collections must not turn an untouched document into a diff.
    for (const key of [ "services", "networks" ]) {
        if (!Object.hasOwn(original, key) && equal(target[key], {})) {
            delete target[key];
        }
    }
    if (equal(original, target)) {
        return source;
    }
    const edits: Edit[] = [];
    const eol = source.includes("\r\n") ? "\r\n" : "\n";
    const lineStart = (offset: number) => source.lastIndexOf("\n", offset - 1) + 1;
    const indentAt = (offset: number) => source.slice(lineStart(offset), offset).match(/^ */)?.[0].length ?? 0;
    const render = (value: unknown, indent: number): string => new Document(value).toString({ lineWidth: 0 })
        .trimEnd().split("\n").join(eol + " ".repeat(indent));

    const patch = (node: Node | null, before: unknown, after: unknown) => {
        if (equal(before, after)) {
            return;
        }
        if (!node?.range) {
            throw new Error("This YAML structure cannot be edited safely; use the text editor.");
        }
        if (isMap(node) && before && after && typeof before === "object" && typeof after === "object"
            && !Array.isArray(before) && !Array.isArray(after)
            && (!node.flow || equal(Object.keys(before).sort(), Object.keys(after).sort()))) {
            const oldMap = before as Record<string, unknown>;
            const newMap = after as Record<string, unknown>;
            const additions: Record<string, unknown> = {};
            // Empty block maps have no valid insertion range; use the bounded replacement below.
            if (node.items.length && Object.keys(newMap).length) {
                for (const pair of node.items) {
                    if (!isScalar(pair.key) || typeof pair.key.value !== "string" || !pair.key.range) {
                        throw new Error("This YAML mapping cannot be edited safely; use the text editor.");
                    }
                    const key = pair.key.value;
                    if (!Object.hasOwn(newMap, key)) {
                        const value = pair.value as Node | null;
                        const start = lineStart(pair.key.range[0]);
                        const end = value?.range?.[2] ?? pair.key.range[2];
                        // Leave preceding comments in place; only remove this entry's lines.
                        edits.push({ start,
                            end,
                            text: "" });
                    } else {
                        patch(pair.value as Node | null, oldMap[key], newMap[key]);
                    }
                }
                for (const key of Object.keys(newMap)) {
                    if (!Object.hasOwn(oldMap, key)) {
                        Object.defineProperty(additions, key, { value: newMap[key],
                            enumerable: true });
                    }
                }
                if (Object.keys(additions).length) {
                    const offset = node.range[1];
                    const indent = indentAt(node.range[0]);
                    const prefix = offset > 0 && source[offset - 1] !== "\n" ? eol : "";
                    edits.push({ start: offset,
                        end: offset,
                        text: prefix + " ".repeat(indent) + render(additions, indent) + eol });
                }
                return;
            }
        }
        if (isSeq(node) && Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
            node.items.forEach((item, index) => patch(item as Node | null, before[index], after[index]));
            return;
        }
        if (isSeq(node) && !node.flow && Array.isArray(before) && Array.isArray(after) && after.length) {
            let prefix = 0;
            let suffix = 0;
            while (prefix < Math.min(before.length, after.length) && equal(before[prefix], after[prefix])) {
                prefix++;
            }
            while (suffix < Math.min(before.length, after.length) - prefix
                && equal(before[before.length - 1 - suffix], after[after.length - 1 - suffix])) {
                suffix++;
            }
            const first = node.items[prefix] as Node | undefined;
            const last = node.items[before.length - suffix - 1] as Node | undefined;
            const start = first?.range ? lineStart(first.range[0]) : node.range[1];
            const end = before.length - suffix > prefix && last?.range ? last.range[2] : start;
            const inserted = after.slice(prefix, after.length - suffix);
            const indent = indentAt(node.range[0]);
            const text = inserted.length ? (start > 0 && source[start - 1] !== "\n" ? eol : "")
                + " ".repeat(indent) + render(inserted, indent) + eol : "";
            edits.push({ start,
                end,
                text });
            return;
        }
        let text: string;
        if (isScalar(node) && (after === null || typeof after !== "object")) {
            const replacement = node.clone();
            replacement.value = after;
            // The source range excludes anchors/tags, which must not be duplicated.
            replacement.anchor = undefined;
            replacement.tag = undefined;
            replacement.comment = undefined;
            replacement.commentBefore = undefined;
            const fragment = new Document();
            fragment.contents = replacement;
            const serialized = fragment.toString({ lineWidth: 0 }).trimEnd();
            const indent = indentAt(node.range[0]) + (/^[|>]/.test(serialized) ? 2 : 0);
            text = serialized.split("\n").join(eol + " ".repeat(indent));
        } else {
            const fragment = new Document(after);
            if (isMap(fragment.contents) || isSeq(fragment.contents)) {
                fragment.contents.flow = true;
            }
            text = fragment.toString({ lineWidth: 0 }).trimEnd();
        }
        const end = node.range[1];
        if (source.slice(node.range[0], end).endsWith("\n")) {
            text += eol;
        }
        edits.push({ start: node.range[0],
            end,
            text });
    };
    if (!doc.contents) {
        return new Document(target).toString({ lineWidth: 0 });
    }
    patch(doc.contents as Node, original, target);
    let result = source;
    let boundary = source.length + 1;
    for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
        if (edit.end > boundary) {
            throw new Error("Overlapping YAML edits; use the text editor.");
        }
        result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
        boundary = edit.start;
    }
    const checked = parseDocument(result);
    if (checked.errors.length || !equal(checked.toJS() ?? {}, target)) {
        throw new Error("The visual edit would change other YAML values; use the text editor. The Compose file was not changed.");
    }
    return result;
}
