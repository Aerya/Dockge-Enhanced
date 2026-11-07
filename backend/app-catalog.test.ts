import test from "node:test";
import assert from "node:assert/strict";
import yaml from "yaml";
import { ApplicationCatalog, catalogURL, stackfileURL, containerCompose, composeWarnings, parseCatalog } from "./app-catalog";

test("catalog restricts outbound requests to raw GitHub and rejects credentials and redirects", () => {
    for (const url of [ "http://raw.githubusercontent.com/a/b/main/a", "https://localhost/a/b/main/a", "https://raw.githubusercontent.com.evil.test/a/b/main/a", "https://secret@raw.githubusercontent.com/a/b/main/a", "https://raw.githubusercontent.com:8443/a/b/main/a", "https://raw.githubusercontent.com/a/b/main/a?token=x" ]) {
        assert.throws(() => catalogURL(url));
    }
    assert.equal(catalogURL("https://raw.githubusercontent.com/a/b/main/a.json").hostname, "raw.githubusercontent.com");
    assert.equal(stackfileURL({ url: "https://github.com/a/b.git",
        stackfile: "apps/app/compose.yml" }), "https://raw.githubusercontent.com/a/b/HEAD/apps/app/compose.yml");
    assert.throws(() => stackfileURL({ url: "https://github.com/a/b",
        stackfile: "../../etc/passwd" }));
});

test("container conversion preserves execution options without executing anything", () => {
    const result = yaml.parse(containerCompose({ image: "nginx:alpine",
        env: [{ name: "PASSWORD" }],
        privileged: true,
        interactive: true,
        ports: [ "8080:80/tcp" ],
        volumes: [{ container: "/data" }, { container: "/host",
            bind: "/",
            readonly: true }] }));
    assert.equal(result.services.app.environment.PASSWORD, "${PASSWORD}");
    assert.equal(result.services.app.volumes[1].read_only, true);
    assert.equal(result.services.app.privileged, true);
    assert.equal(result.services.app.tty, true);
    assert.deepEqual(result.volumes, { data0: {} });
    assert.throws(() => containerCompose({ image: "x",
        unknown_option: "danger" }));
    assert.throws(() => containerCompose({ image: "x",
        env: [{ name: "BAD\nKEY" }] }));
});

test("Compose safety warnings flag mounts, host privileges and missing companion files", () => {
    assert.deepEqual(composeWarnings("services:\n  app:\n    image: nginx\n    privileged: true\n    volumes: [/var/run/docker.sock:/var/run/docker.sock]\n    env_file: .env.example"), [ "appCatalog.hostAccess", "appCatalog.mounts", "appCatalog.extraFiles" ]);
    assert.throws(() => composeWarnings("hello: world"));
    assert.equal(parseCatalog(JSON.stringify({ templates: [{ type: 2 }, { type: 1,
        platform: "windows" }, { type: 3 }] }))[2].supported, true);
});

test("revision pins selected catalog entry, cache refresh cannot silently change it", async () => {
    let calls = 0;
    const catalog = new ApplicationCatalog(async () => {
        calls++;
        return JSON.stringify({ templates: [{ type: 1,
            title: "App",
            image: "busybox:stable" }] });
    });
    const source = "https://raw.githubusercontent.com/a/b/main/templates.json";
    const list = await catalog.list(source);
    await catalog.list(source, true);
    assert.equal(calls, 1);
    assert.match((await catalog.draft(source, list.revision, 0)).compose, /busybox:stable/);
    await assert.rejects(catalog.draft(source, "old", 0), /refreshRequired/);
    await assert.rejects(catalog.draft(source, list.revision, -1), /unsupported/);
});

test("download failure releases reservation for retry", async () => {
    let calls = 0;
    const catalog = new ApplicationCatalog(async () => {
        if (!calls++) {
            throw new Error("offline");
        }
        return "{\"templates\":[]}";
    });
    const source = "https://raw.githubusercontent.com/a/b/main/templates.json";
    await assert.rejects(catalog.list(source), /offline/);
    assert.equal((await catalog.list(source)).items.length, 0);
});
