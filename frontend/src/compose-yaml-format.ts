import { parseDocument } from "yaml";
import { preserveTmpfsModeLiterals } from "./compose-yaml-preserve";

export function formatComposeYAML(source: string): string {
    const doc = parseDocument(source);

    if (doc.errors.length > 0) {
        throw doc.errors[0];
    }

    const formatted = doc.toString({
        indent: 2,
        indentSeq: true,
        lineWidth: 0,
    });

    return preserveTmpfsModeLiterals(source, formatted);
}
