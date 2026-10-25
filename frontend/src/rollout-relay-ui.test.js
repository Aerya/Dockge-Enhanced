import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse } from "@vue/compiler-sfc";
import { reactive, toRaw, defineComponent } from "vue";
import { addRolloutRelay } from "./rollout-relay.ts";
import { setComposeLabel } from "../../common/compose-labels.ts";
import { LABEL_ROLLOUT } from "../../common/service-rollout.ts";

const { descriptor } = parse(readFileSync(new URL("./components/Container.vue", import.meta.url), "utf8"));
let confirmed = true;
const alerts = [];
const component = runInNewContext(descriptor.script.content.replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "").replace("export default", "result ="), {
    defineComponent, toRaw, addRolloutRelay, setComposeLabel, LABEL_ROLLOUT,
    FontAwesomeIcon: {}, VolumeBrowser: {}, ContainerStatsBadge: {}, StackScheduleEditor: {}, ServiceResourceLimits: {},
    window: { confirm: () => confirmed, alert: message => alerts.push(message) },
});

test("actual editor action changes only the confirmed reactive Compose draft", () => {
    const context = { rollingUpdateSupported: true, name: "web", relayPort: 8080, $t: key => key,
        jsonObject: reactive({ services: { web: { image: "example:latest", healthcheck: { test: ["CMD", "true"] }, ports: ["18080:8080"] } } }),
    };
    confirmed = false;
    component.methods.prepareRelay.call(context);
    assert.equal(Object.keys(context.jsonObject.services).length, 1);
    confirmed = true;
    component.methods.prepareRelay.call(context);
    assert.deepEqual(alerts, []);
    assert.equal(Object.keys(context.jsonObject.services).length, 2);
    assert.equal(context.jsonObject.services.web.ports, undefined);
    assert.ok(context.jsonObject.networks["web-rollout-relay"]);
});

test("unsupported linked instance cannot prepare a relay", () => {
    const context = { rollingUpdateSupported: false };
    component.methods.prepareRelay.call(context);
    assert.deepEqual(Object.keys(context), ["rollingUpdateSupported"]);
});

test("re-enabling relay rollout preserves a CMD healthcheck", () => {
    const service = { healthcheck: { test: ["CMD", "true"] } };
    const context = { rollingUpdateSupported: true, hasRollingRelay: true, service, $t: key => key };
    confirmed = true;
    component.computed.rollingUpdate.set.call(context, true);
    assert.equal(service.labels[LABEL_ROLLOUT], "true");
    assert.deepEqual(service.healthcheck.test, ["CMD", "true"]);
});

test("all relay controls and warnings are available in the five locales", () => {
    for (const locale of ["en", "fr", "de", "es", "zh-CN"]) {
        const messages = JSON.parse(readFileSync(new URL(`./lang/${locale}.json`, import.meta.url), "utf8"));
        for (const suffix of ["relayAdd", "relayHelp", "relayConfirm", "relayInvalid", "relayPort", "warning", "draining"]) {
            assert.ok(messages["serviceRollout." + suffix], `${locale}: ${suffix}`);
        }
    }
});
