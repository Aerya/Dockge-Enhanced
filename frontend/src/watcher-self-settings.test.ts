import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./components/watcher/WatcherUpdatesTab.vue", import.meta.url), "utf8");
const script = source.split("<script setup lang=\"ts\">")[1].split("</script>")[0];
const parsed = ts.createSourceFile("settings.ts", script, ts.ScriptTarget.Latest, true);
const names = new Set([ "load", "save", "changeMode", "markSettingsDirty" ]);
const functions = parsed.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text ?? ""))
    .map(node => node.getText(parsed)).join("\n");

function deferred() {
    let resolve!: (value: unknown) => void;
    const promise = new Promise(r => {
        resolve = r;
    });
    return { promise,
        resolve };
}

function harness() {
    const reads: ReturnType<typeof deferred>[] = [];
    const writes: { body: { mode: string };
        response: ReturnType<typeof deferred> }[] = [];
    const context = vm.createContext({
        watcherApi: (method: string, path: string, body: { mode: string }) => {
            if (method === "POST") {
                const response = deferred();
                writes.push({ body,
                    response });
                return response.promise;
            }
            if (path === "/self/settings") {
                const response = deferred();
                reads.push(response);
                return response.promise;
            }
            return Promise.resolve({ ok: false });
        },
    });
    const setup = `
let modeEditing = false, settingsDirty = false, settingsRevision = 0;
const settings = { value: { mode: "manual", backupProvider: "restic" } };
const savedBackupProvider = { value: "restic" }, settingsError = { value: "" };
const operationExecuting = { value: false }, hostStats = { value: null }, updatePause = { value: {} };
const t = (key: string) => key;
${functions}
({ settings, settingsError, load, save, changeMode, edit: (value: boolean) => { modeEditing = value; } });`;
    const api = vm.runInContext(ts.transpileModule(setup, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    return { ...api,
        reads,
        writes };
}

const manualResponse = { ok: true,
    data: { mode: "manual",
        backupProvider: "restic" } };

test("the mode change sends the actual selection, then survives a poll", async () => {
    const h = harness();
    assert.match(source, /id="self-update-mode"[^>]*@change="changeMode"/);
    const saving = h.changeMode({ target: { value: "sidecar" } });
    assert.equal(h.writes[0].body.mode, "sidecar");
    h.writes[0].response.resolve({ ok: true });
    await saving;
    const loading = h.load();
    h.reads[0].resolve({ ok: true,
        data: { mode: "sidecar" } });
    await loading;
    assert.equal(h.settings.value.mode, "sidecar");
});

for (const timing of [ "before", "during" ]) {
    test(`a stale poll started ${timing} saving cannot restore manual mode`, async () => {
        const h = harness();
        let loading = timing === "before" ? h.load() : undefined;
        const saving = h.changeMode({ target: { value: "sidecar" } });
        loading ??= h.load();
        h.writes[0].response.resolve({ ok: true });
        await saving;
        h.reads[0].resolve(manualResponse);
        await loading;
        assert.equal(h.settings.value.mode, "sidecar");
    });
}

test("polling does not change the selection while its native menu is focused", async () => {
    const h = harness();
    h.settings.value.mode = "sidecar";
    h.edit(true);
    const loading = h.load();
    h.edit(false);
    h.reads[0].resolve(manualResponse);
    await loading;
    assert.equal(h.settings.value.mode, "sidecar");
});

test("a rejected save keeps the draft and shows its error", async () => {
    const h = harness();
    const saving = h.changeMode({ target: { value: "sidecar" } });
    h.writes[0].response.resolve({ ok: false,
        message: "fixture: write refused" });
    await saving;
    const loading = h.load();
    h.reads[0].resolve(manualResponse);
    await loading;
    assert.equal(h.settingsError.value, "fixture: write refused");
    assert.equal(h.settings.value.mode, "sidecar");
});
