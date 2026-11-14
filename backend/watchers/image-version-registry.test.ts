import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { Settings } from "../settings";
import { previewImageVersions, previewObservedImageVersions } from "./image-watcher";

test("candidates for another architecture are never offered", async (t) => {
    t.mock.method(axios, "get", async (url: string) => {
        if (url.includes("tags/list")) {
            return { data: { tags: [ "1.2.0", "2.0.0" ] },
                headers: {} };
        }
        const wrong = url.endsWith("2.0.0");
        return { data: { manifests: [{ digest: "sha256:" + "a".repeat(64),
            platform: { os: "linux",
                architecture: wrong ? "arm64" : "amd64" } }] },
        headers: { "content-type": "application/vnd.oci.image.index.v1+json",
            "docker-content-digest": "sha256:" + "b".repeat(64) } };
    });
    const result = await previewImageVersions("registry.test/app:1", [], "linux/amd64");
    assert.equal(result.sameMajor, "1.2.0");
    assert.equal(result.nextMajor, null);
    assert.equal(result.unavailableCandidate, true);
});
test("single-platform manifests must verify their image config", async (t) => {
    t.mock.method(axios, "get", async (url: string) => {
        if (url.includes("tags/list")) {
            return { data: { tags: [] },
                headers: {} };
        }
        if (url.includes("/blobs/")) {
            return { data: { os: "linux",
                architecture: "arm64" },
            headers: {} };
        }
        return { data: { config: { digest: "sha256:" + "c".repeat(64) } },
            headers: { "content-type": "application/vnd.oci.image.manifest.v1+json",
                "docker-content-digest": "sha256:" + "a".repeat(64) } };
    });
    await assert.rejects(previewImageVersions("registry.test/app:1", [], "linux/amd64"), /platform mismatch/);
});

test.beforeEach(() => {
    test.mock.method(Settings, "get", async () => null);
});
test.afterEach(() => test.mock.restoreAll());

test("private registry pagination, credentials and platform-verified digest aliases", async (t) => {
    const requests: string[] = [];
    t.mock.method(axios, "get", async (url: string, options: { headers: { Authorization: string };
        maxRedirects: number }) => {
        requests.push(url);
        assert.equal(options.maxRedirects, 0);
        assert.equal(options.headers.Authorization, `Basic ${Buffer.from("test:secret").toString("base64")}`);
        if (url.includes("tags/list")) {
            return url.includes("last=") ? { data: { tags: [ "2.0.0" ] },
                headers: {} } : { data: { tags: [ "1.2.0", "1.3.0" ] },
                headers: { link: "</v2/team/app/tags/list?last=1.3.0>; rel=\"next\"" } };
        }
        if (url.includes("/blobs/")) {
            return { data: { os: "linux",
                architecture: process.arch === "arm64" ? "arm64" : "amd64" },
            headers: {} };
        }
        return { data: { config: { digest: "sha256:" + "c".repeat(64) } },
            headers: { "content-type": "application/vnd.oci.image.manifest.v1+json",
                "docker-content-digest": `sha256:${(url.endsWith("1.3.0") || url.endsWith("1") ? "a" : "b").repeat(64)}` } };
    });
    const result = await previewImageVersions("registry.test/team/app:1", [{ registry: "registry.test",
        username: "test",
        token: "secret" }]);
    assert.deepEqual(result.targetAliases, [ "1.3.0" ]);
    assert.equal(result.sameMajor, "1.3.0");
    assert.equal(result.nextMajor, "2.0.0");
    assert.equal(result.partial, false);
    assert.ok(requests.some(url => url.includes("last=")));
});

test("unknown stack cannot cause a registry request", async (t) => {
    const request = t.mock.method(axios, "get", async () => {
        throw new Error("Unexpected network request");
    });
    await assert.rejects(previewObservedImageVersions("unknown-stack", "registry.test/private:latest"));
    assert.equal(request.mock.callCount(), 0);
});

test("pagination cannot leak private registry credentials", async (t) => {
    const request = t.mock.method(axios, "get", async () => ({ data: { tags: [ "1.0.0" ] },
        headers: { link: "<https://evil.test/v2/team/app/tags/list>; rel=\"next\"" } }));
    await assert.rejects(previewImageVersions("registry.test/team/app:latest", []), /pagination/);
    assert.equal(request.mock.callCount(), 1);
});

test("pagination loops fail and listings are bounded", async (t) => {
    let count = 0;
    t.mock.method(axios, "get", async () => {
        count++;
        return { data: { tags: [] },
            headers: { link: "</v2/team/app/tags/list?n=100>; rel=\"next\"" } };
    });
    await assert.rejects(previewImageVersions("registry.test/team/app:latest", []), /loop/);
    assert.equal(count, 1);
});
