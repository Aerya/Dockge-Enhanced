import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Document, parseDocument } from "yaml";
import {
    composeLabelIsFalse,
    composeLabelIsTrue,
    LABEL_IMAGEUPDATES_CHECK,
    LABEL_STATUS_IGNORE,
    setComposeLabel,
} from "./compose-labels";

test("reads boolean-compatible labels from mapping and list syntaxes", () => {
    assert.equal(composeLabelIsTrue({ [LABEL_STATUS_IGNORE]: "TRUE" }, LABEL_STATUS_IGNORE), true);
    assert.equal(composeLabelIsFalse([ `${LABEL_IMAGEUPDATES_CHECK}=false` ], LABEL_IMAGEUPDATES_CHECK), true);
});

test("updates managed labels without changing unrelated mapping labels", () => {
    const service: Record<string, unknown> = { labels: { existing: "kept" } };
    setComposeLabel(service, LABEL_STATUS_IGNORE, "true");
    assert.deepEqual(service.labels, {
        existing: "kept",
        [LABEL_STATUS_IGNORE]: "true",
    });
    setComposeLabel(service, LABEL_STATUS_IGNORE, null);
    assert.deepEqual(service.labels, { existing: "kept" });
});

test("preserves list syntax while adding and removing managed labels", () => {
    const service: Record<string, unknown> = { labels: [ "existing=kept", `${LABEL_IMAGEUPDATES_CHECK}=true` ] };
    setComposeLabel(service, LABEL_IMAGEUPDATES_CHECK, "false");
    assert.deepEqual(service.labels, [ "existing=kept", `${LABEL_IMAGEUPDATES_CHECK}=false` ]);
    setComposeLabel(service, LABEL_IMAGEUPDATES_CHECK, null);
    assert.deepEqual(service.labels, [ "existing=kept" ]);
});

test("survives the Compose editor YAML parse and save round trip", () => {
    const original = "services:\n  app:\n    image: example/app:latest\n    labels:\n      existing: kept\n";
    const parsed = parseDocument(original).toJS() as { services: Record<string, Record<string, unknown>> };
    setComposeLabel(parsed.services.app, LABEL_STATUS_IGNORE, "true");
    setComposeLabel(parsed.services.app, LABEL_IMAGEUPDATES_CHECK, "false");
    const saved = new Document(parsed).toString();
    const roundTrip = parseDocument(saved).toJS() as { services: Record<string, { labels: Record<string, unknown> }> };
    assert.deepEqual(roundTrip.services.app.labels, {
        existing: "kept",
        [LABEL_STATUS_IGNORE]: "true",
        [LABEL_IMAGEUPDATES_CHECK]: "false",
    });
});
