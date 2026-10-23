import { isMap, isScalar, parseDocument } from "yaml";

/** Change only an explicit image scalar. Never rewrite aliases, merge keys or variables. */
export function prepareImageSync(source: string, service: string, image: string): string {
    if (!image || /\s|\$/.test(image)) {
        throw new Error("composeDiagnostics.manualSync");
    }
    const document = parseDocument(source);
    const node = document.getIn([ "services", service ], true);
    if (document.errors.length || !isMap(node)) {
        throw new Error("composeDiagnostics.manualSync");
    }
    const current = node.get("image", true);
    if (!isScalar(current) || current.anchor || typeof current.value !== "string" || current.value.includes("$")) {
        throw new Error("composeDiagnostics.manualSync");
    }
    current.value = image;
    return document.toString();
}
