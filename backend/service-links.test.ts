import assert from "node:assert/strict";
import test from "node:test";
import { defaultServiceLinks, validateServiceLinks, safeServiceUrl, composeServiceUrls } from "../common/service-links";
import { ServiceLinksStore } from "./service-links";
import { authorizeServiceLinks } from "./socket-handlers/service-links-socket-handler";
import type { DockgeSocket } from "./util-server";
import { R } from "redbean-node";

test("URLs reject executable schemes, credentials, whitespace and oversized values", () => {
    for (const url of [ "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "//example.org", "http://user:password@example.org", "https://example.org/\n", "https://example.org/" + "x".repeat(2048) ]) {
        assert.equal(safeServiceUrl(url), null);
    }
    assert.equal(safeServiceUrl("http://192.0.2.1:8080"), "http://192.0.2.1:8080/");
});

test("manual links are validated and unknown properties never persist", () => {
    const config = { ...defaultServiceLinks(),
        links: [{ id: "fixture",
            name: "Demo",
            url: "https://example.org",
            group: "Apps",
            enabled: true,
            token: "not-saved" }] };
    assert.equal("token" in validateServiceLinks(config).links[0], false);
    assert.throws(() => validateServiceLinks({ ...config,
        links: [ ...config.links, ...config.links ] }), /invalid/);
    assert.throws(() => validateServiceLinks({ ...config,
        links: [{ ...config.links[0],
            url: "javascript:alert(1)" }] }), /invalid/);
});

test("Compose metadata is deduplicated and never exposes environment or labels", () => {
    const compose = { services: { app: { environment: { PASSWORD: "private" },
        labels: { url: "https://private.example" } } },
    "x-dockge": { urls: [ "https://example.org", "https://example.org/", "file:///etc/passwd", null ] } };
    assert.deepEqual(composeServiceUrls(compose), [ "https://example.org/" ]);
    assert.deepEqual(composeServiceUrls(null), []);
});

test("save survives reopening and concurrent tabs cannot silently overwrite changes", async () => {
    let persisted: unknown = null;
    const read = async () => persisted;
    const write = async (value: unknown) => {
        persisted = structuredClone(value);
    };
    const store = new ServiceLinksStore(read, write);
    const initial = await store.load();
    const first = store.save({ ...initial,
        showStackLinks: false });
    const second = store.save(initial);
    assert.equal((await first).revision, 1);
    await assert.rejects(second, /conflict/);
    assert.equal((await new ServiceLinksStore(read, write).load()).showStackLinks, false);
    persisted = "{broken";
    await assert.rejects(store.save({ ...initial,
        revision: 1 }), /invalid/);
    assert.equal(persisted, "{broken", "do not overwrite corrupted settings");
});

test("unauthenticated, restricted and revoked accounts cannot access link metadata", async t => {
    let role = "restricted";
    t.mock.method(R, "findOne", async () => role === "revoked" ? null : { role });
    await assert.rejects(authorizeServiceLinks({} as DockgeSocket));
    await assert.rejects(authorizeServiceLinks({ userID: 1 } as DockgeSocket), /denied/);
    role = "admin";
    await authorizeServiceLinks({ userID: 1 } as DockgeSocket);
    role = "revoked";
    await assert.rejects(authorizeServiceLinks({ userID: 1 } as DockgeSocket), /denied/);
});
