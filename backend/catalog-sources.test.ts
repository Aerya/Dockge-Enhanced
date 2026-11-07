import test from "node:test";
import assert from "node:assert/strict";
import { CatalogSources, CATALOG_SOURCES, parseSourceMetadata } from "./catalog-sources";
import { safeCatalogLink } from "./app-catalog";

test("untrusted websites and icons cannot become script or local network links", () => {
    for (const url of [ "javascript:alert(1)", "http://example.org", "https://127.0.0.1/x", "https://[::1]/", "https://admin:password@example.org", "https://nas.local/x" ]) {
        assert.equal(safeCatalogLink(url), "");
    }
    assert.equal(safeCatalogLink("https://example.org/app"), "https://example.org/app");
});

test("CasaOS metadata becomes a browsable card without executing hooks", () => {
    const source = CATALOG_SOURCES.find(source => source.id === "roqueos")!;
    const card = parseSourceMetadata(source, "services: {app: {image: nginx}}\nx-casaos:\n  title: {en_us: App}\n  category: Network\n  description: {en_us: Description}\n  icon: https://example.org/logo.png\n  developer_url: https://example.org\n", "Apps/Demo/docker-compose.yml", 0);
    assert.equal(card.title, "App");
    assert.equal(card.website, "https://example.org/");
    assert.deepEqual(card.categories, [ "Network" ]);
    assert.equal(card.native, true);
});

test("repository indexing exposes real progress, isolates failed entries and imports draft only", async () => {
    let release!: () => void;
    const barrier = new Promise<void>(resolve => {
        release = resolve;
    });
    const store = new CatalogSources(async url => {
        if (String(url).includes("Broken")) {
            throw new Error("404");
        }
        await barrier;
        return "services: {app: {image: nginx}}\nx-casaos: {title: {en_us: Demo}, category: Network}";
    }, async () => JSON.stringify({ tree: [{ type: "blob",
        path: "Apps/Demo/docker-compose.yml" }, { type: "blob",
        path: "Apps/Broken/docker-compose.yml" }, { type: "blob",
        path: "Apps/../../secret/docker-compose.yml" }] }));
    const first = await store.browse("roqueos");
    assert.equal(first.loading, true);
    assert.equal(first.items.length, 2);
    assert.equal(first.items[0].supported, false);
    release();
    await new Promise(resolve => setImmediate(resolve));
    const finished = await store.browse("roqueos");
    assert.equal(finished.loaded, 2);
    assert.equal(finished.failed, 1);
    assert.equal(finished.loading, false);
    assert.equal(finished.items[1].supported, false);
    const draft = await store.draft("roqueos", finished.revision, 0);
    assert.match(draft.compose, /nginx/);
    assert.ok(draft.warnings.includes("appCatalog.native"));
    await assert.rejects(store.draft("roqueos", "stale", 0));
    await assert.rejects(store.draft("yundera", finished.revision, 0));
});

test("TrueNAS is discoverable but Jinja is never presented as deployable Compose", async () => {
    const store = new CatalogSources(async () => JSON.stringify({ stable: { app: { title: "App",
        home: "https://example.org",
        categories: [ "tools" ] } } }));
    const result = await store.browse("truenas");
    assert.equal(result.items[0].supported, false);
    assert.equal(result.items[0].website, "https://example.org/");
    await assert.rejects(store.draft("truenas", result.revision, 0));
});

test("native drafts preserve Compose defaults and escaped variables", async () => {
    const compose = "services:\n  app:\n    image: nginx\n    environment:\n      DEFAULT: ${OPTION-default}\n      EMPTY_DEFAULT: ${OTHER:-fallback}\n      REQUIRED: ${TOKEN:?required}\n      SIMPLE: $HOST_PATH\n      ESCAPED: $$CONTAINER_VAR\n";
    const store = new CatalogSources(async () => compose, async () => JSON.stringify({ tree: [{ type: "blob",
        path: "Apps/Demo/docker-compose.yml" }] }));
    await store.browse("roqueos");
    await new Promise(resolve => setImmediate(resolve));
    const result = await store.browse("roqueos");
    const draft = await store.draft("roqueos", result.revision, 0);
    assert.equal(draft.compose, compose);
    assert.deepEqual(draft.fields.map(field => field.name), [ "TOKEN", "HOST_PATH" ]);
});
