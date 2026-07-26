import { isSeq, parseDocument } from "yaml";

export class PlugNPiNSequenceLabelsError extends Error {
    constructor() {
        super("PlugNPiN labels cannot be applied automatically to list-form Compose labels");
        this.name = "PlugNPiNSequenceLabelsError";
    }
}

export function applyPlugNPiNLabelsToCompose(
    composeYAML: string,
    service: string,
    labels: Record<string, string>,
): string {
    const doc = parseDocument(composeYAML);
    if (doc.errors.length > 0) {
        throw doc.errors[0];
    }

    const services = doc.get("services");
    if (!services || typeof services !== "object" || !doc.hasIn([ "services", service ])) {
        throw new Error(`Compose service does not exist: ${service}`);
    }

    const existingLabels = doc.getIn([ "services", service, "labels" ], true);
    if (isSeq(existingLabels)) {
        throw new PlugNPiNSequenceLabelsError();
    }

    for (const [ key, value ] of Object.entries(labels)) {
        doc.setIn([ "services", service, "labels", key ], value);
    }
    return doc.toString();
}
