import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parse } from "@vue/compiler-sfc";

function component(confirm: (message: string) => boolean) {
    const source = readFileSync(new URL("./components/ComposeDiagnostics.vue", import.meta.url), "utf8");
    const script = parse(source).descriptor.script!.content.replace("export default", "module.exports =");
    const sandbox = { module: { exports: {} },
        window: { confirm },
        setTimeout,
        clearTimeout };
    vm.runInNewContext(script, sandbox);
    return sandbox.module.exports as {
        methods: {
            scan(this: unknown): Promise<unknown>;
            confirmSave(this: unknown): Promise<boolean>;
        };
    };
}

test("editor preflight requires explicit confirmation for conflicts and incomplete scans", async () => {
    let confirmations = 0;
    const ui = component(() => {
        confirmations++;
        return false;
    });
    for (const result of [ null, { conflicts: [{}],
        warnings: [] }, { conflicts: [],
        warnings: [ "unreadable" ] }]) {
        assert.equal(await ui.methods.confirmSave.call({ scan: async () => result,
            $t: (key: string) => key }), false);
    }
    assert.equal(confirmations, 3);
    assert.equal(await ui.methods.confirmSave.call({ scan: async () => ({ conflicts: [],
        warnings: [] }),
    $t: (key: string) => key }), true);
    assert.equal(confirmations, 3);
});

test("scan does not apply a stale result after the user changes the draft", async () => {
    const ui = component(() => true);
    let reply!: (value: unknown) => void;
    const context = {
        busy: false,
        visible: false,
        error: false,
        result: null,
        endpoint: "fixture",
        draft: { compose: "services: {}" },
        $root: { emitAgent: (_endpoint: string, event: string, _draft: unknown, callback: (value: unknown) => void) => {
            assert.equal(event, "inspectComposeDraft");
            reply = callback;
        } },
    };
    const promise = ui.methods.scan.call(context);
    context.draft.compose = "services: {web: {image: nginx}}";
    reply({ ok: true,
        data: { conflicts: [],
            warnings: [],
            drift: [] } });
    assert.equal(await promise, null);
    assert.equal(context.result, null);
    assert.equal(context.error, true);
    assert.equal(context.busy, false);
});

test("successful scan preserves the draft and only requests a read-only diagnostic", async () => {
    const ui = component(() => true);
    const draft = { compose: "services: {}" };
    const result = { conflicts: [],
        warnings: [],
        drift: [] };
    const context = { busy: false,
        draft,
        $root: { emitAgent: (_endpoint: string, event: string, _draft: unknown, callback: (value: unknown) => void) => {
            assert.equal(event, "inspectComposeDraft");
            callback({ ok: true,
                data: result });
        } } };
    assert.equal(await ui.methods.scan.call(context), result);
    assert.deepEqual(draft, { compose: "services: {}" });
});
