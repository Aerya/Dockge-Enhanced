import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse } from "@vue/compiler-sfc";
import { composeLabelValue, setComposeLabel } from "../../common/compose-labels.ts";
const source = readFileSync(new URL("./components/AdvancedDeployment.vue", import.meta.url), "utf8");
const { descriptor } = parse(source);
let confirmed = false;
const component = runInNewContext(descriptor.script.content.replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "").replace("export default", "result ="), {
    composeLabelValue, setComposeLabel, window: { confirm: () => confirmed },
});
test("old agents and declined confirmation cannot enable Canary", () => {
    const context = { supported: false, service: { image: "app" }, $t: key => key };
    component.computed.mode.set.call(context, "automatic");
    assert.equal(context.service.labels, undefined);
    context.supported = true;
    component.computed.mode.set.call(context, "automatic");
    assert.equal(context.service.labels, undefined);
    confirmed = true;
    component.computed.mode.set.call(context, "manual");
    assert.equal(context.service.labels["dockge.rollout.canary"], "manual");
    assert.equal(context.service.labels["dockge.rollout.migrations"], "none");
});
test("unsupported agent cannot launch a preview", async () => {
    const context = { supported: false, confirmed: true, busy: false, request() { throw new Error("must not emit"); } };
    await component.methods.preview.call(context);
});
test("all advanced deployment labels exist in five languages", () => {
    const keys = [...new Set([...source.matchAll(/advancedDeployment\.([a-zA-Z]+)/g)].map(match => match[1]))];
    for (const lang of ["en", "fr", "de", "es", "zh-CN"]) {
        const labels = JSON.parse(readFileSync(new URL(`./lang/${lang}.json`, import.meta.url), "utf8"));
        for (const key of [...keys, "running", "healthy", "noHealth", "failed"]) { assert.equal(typeof labels["advancedDeployment." + key], "string", lang + ":" + key); }
    }
});
