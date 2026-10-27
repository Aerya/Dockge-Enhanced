import test from "node:test";
import assert from "node:assert/strict";
import { createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";

test("service controls show the server default, preserve existing times and use the API's resolved time", async (t) => {
    for (const name of [ "localStorage", "sessionStorage" ]) {
        const original = Object.getOwnPropertyDescriptor(globalThis, name);
        Object.defineProperty(globalThis, name, { configurable: true,
            value: { getItem: () => null } });
        t.after(() => {
            if (original) {
                Object.defineProperty(globalThis, name, original);
            } else {
                Reflect.deleteProperty(globalThis, name);
            }
        });
    }
    const { useImageStatus } = await import("./composables/useImageStatus");
    let advertisedTime: string | undefined = "05:30";
    let posted: Record<string, unknown> = {};
    t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
            posted = JSON.parse(String(init.body));
            return Response.json({ ok: true,
                data: { time: "06:45" } });
        }
        return Response.json({ ok: true,
            data: url.endsWith("/status") ? [] : {
                defaultScheduledTime: advertisedTime,
                autoUpdateConfig: { "demo::db": { mode: "scheduled",
                    time: "00:00" } },
            } });
    });
    let api!: ReturnType<typeof useImageStatus>;
    await renderToString(createSSRApp({ setup() {
        api = useImageStatus();
        return () => null;
    } }));
    await api.refreshImageStatus();
    assert.equal(api.autoUpdateLoaded.value, true);
    assert.equal(api.defaultScheduledTime.value, "05:30");
    assert.equal(api.autoUpdateFor("demo", "web").time, "05:30");
    assert.equal(api.autoUpdateFor("demo", "db").time, "00:00");
    assert.equal((await api.setAutoUpdateMode("demo", "web", "scheduled")).ok, true);
    assert.equal(Object.hasOwn(posted, "time"), false);
    assert.equal(api.autoUpdateFor("demo", "web").time, "06:45");
    await api.setAutoUpdateMode("demo", "db", "scheduled", "00:00");
    assert.equal(posted.time, "00:00");
    advertisedTime = undefined;
    await api.refreshImageStatus();
    assert.equal(api.defaultScheduledTime.value, "02:00");
    assert.equal(api.autoUpdateFor("demo", "db").time, "00:00");
});
