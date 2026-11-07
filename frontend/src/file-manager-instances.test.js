import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse } from "@vue/compiler-sfc";
import { reactive, computed } from "vue";

const { descriptor } = parse(readFileSync(new URL("./pages/Files.vue", import.meta.url), "utf8"));
const component = runInNewContext(descriptor.script.content
    .replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "")
    .replace("export default", "result ="), {
    BDropdown: {}, BDropdownItem: {}, BModal: {}, FileLogViewer: {}, FileTextEditor: {},
});
const plain = value => JSON.parse(JSON.stringify(value));

test("file manager uses configured instance names without changing routing identifiers", () => {
    const root = reactive({ agentList: {
        "": { displayName: "Garuda" },
        "host-a:5001": { displayName: "LincStation", name: "obsolete" },
        "host-b:5006": { displayName: "DockerLab" },
        "reverse:123": { displayName: "Reverse", reverse: true },
    }, agentStatusList: { "": "online", "host-a:5001": "online", "host-b:5006": "offline", "reverse:123": "online" } });
    const context = { $root: root, $t: () => "Actuel" };
    const options = computed(() => component.computed.endpointOptions.call(context));
    assert.deepEqual(plain(options.value), [
        { value: "", label: "Garuda", offline: false },
        { value: "host-a:5001", label: "LincStation", offline: false },
        { value: "host-b:5006", label: "DockerLab", offline: true },
        { value: "reverse:123", label: "Reverse", offline: false },
    ]);
    root.agentList["host-a:5001"].displayName = "Renamed";
    assert.equal(options.value[1].label, "Renamed");
    root.agentList[""].displayName = "";
    delete root.agentList["host-a:5001"].displayName;
    assert.equal(options.value[0].label, "Actuel");
    assert.equal(options.value[1].label, "host-a:5001");
    for (const option of options.value) {
        let route;
        component.methods.switchEndpoint.call({ selectedEndpoint: option.value, $router: { push: value => { route = value; } } });
        assert.deepEqual(plain(route), option.value
            ? { name: "filesEndpoint", params: { endpoint: option.value } } : { name: "files" });
    }
});
