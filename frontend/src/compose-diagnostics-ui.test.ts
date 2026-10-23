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
            scan(this: unknown, notify?: boolean): Promise<unknown>;
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
        $emit: () => {},
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
    const promise = ui.methods.scan.call(context, false);
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
        $emit: () => {},
        draft,
        $root: { emitAgent: (_endpoint: string, event: string, _draft: unknown, callback: (value: unknown) => void) => {
            assert.equal(event, "inspectComposeDraft");
            callback({ ok: true,
                data: result });
        } } };
    assert.equal(await ui.methods.scan.call(context, false), result);
    assert.deepEqual(draft, { compose: "services: {}" });
});

test("panel opens only for port conflicts or image drift, never during a scan or for an empty result", async () => {
    const ui = component(() => true);
    for (const [ conflicts, drift, warnings, expected ] of [
        [[], [], [], false ],
        [[], [], [ "unreadable" ], false ],
        [[{}], [], [], true ],
        [[], [{}], [], true ],
    ] as [object[], object[], string[], boolean][]) {
        const events: boolean[] = [];
        const notifications: string[] = [];
        let reply!: (value: unknown) => void;
        const context = { busy: false,
            visible: true,
            draft: {},
            $emit: (_name: string, value: boolean) => events.push(value),
            $t: (key: string) => key,
            $root: {
                toastSuccess: (message: string) => notifications.push(message),
                toastError: (message: string) => notifications.push(message),
                emitAgent: (_endpoint: string, _event: string, _draft: unknown, callback: (value: unknown) => void) => {
                    reply = callback;
                },
            } };
        const pending = ui.methods.scan.call(context);
        assert.equal(context.visible, false);
        assert.equal(context.busy, true);
        reply({ ok: true,
            data: { conflicts,
                drift,
                warnings } });
        await pending;
        assert.equal(context.visible, expected);
        assert.deepEqual(events, [ true, false ]);
        assert.equal(notifications.length, expected ? 0 : 1);
        if (warnings.length) {
            assert.match(notifications[0], /partial/);
        }
    }
});

test("failed manual scan produces an error notification without opening the panel", async () => {
    const ui = component(() => true);
    const notifications: string[] = [];
    const context = { busy: false,
        visible: true,
        draft: {},
        $emit: () => {},
        $t: (key: string) => key,
        $root: {
            toastError: (message: string) => notifications.push(message),
            emitAgent: (_endpoint: string, _event: string, _draft: unknown, callback: (value: unknown) => void) => callback({ ok: false }),
        } };
    assert.equal(await ui.methods.scan.call(context), null);
    assert.equal(context.visible, false);
    assert.equal(context.busy, false);
    assert.deepEqual(notifications, [ "composeDiagnostics.unavailable" ]);
});

test("automatic clean checks remain silent and request a scan without notifications", async () => {
    const ui = component(() => true);
    const confirmed = await ui.methods.confirmSave.call({
        scan: async (notify: boolean) => {
            assert.equal(notify, false);
            return { conflicts: [],
                drift: [],
                warnings: [] };
        },
    });
    assert.equal(confirmed, true);
});
