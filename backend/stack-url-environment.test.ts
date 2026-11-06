import assert from "node:assert/strict";
import test from "node:test";
import { resolvedStackUrls } from "./stack-url-environment";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("hosting instance resolves global variables without returning its environment", async () => {
    const raw = "x-dockge:\n  urls:\n    - url: https://${DOMAIN}/web\n      label: Web\n";
    for (const domain of [ "first.example", "second.example" ]) {
        const result = await resolvedStackUrls(raw, async () => `services:\n  web:\n    environment:\n      PASSWORD: never-return-me\nx-dockge:\n  urls:\n    - url: https://${domain}/web\n      label: Web\n`);
        assert.deepEqual(result, { links: [{ url: `https://${domain}/web`,
            label: "Web" }],
        unavailable: false });
        assert.ok(!JSON.stringify(result).includes("never-return-me"));
    }
});

test("literal links do not spawn Compose, labelled and legacy forms both work", async () => {
    const result = await resolvedStackUrls("x-dockge:\n  urls: [https://example.org, {url: \"https://example.net\", label: API}]", async () => {
        throw new Error("must not run");
    });
    assert.equal(result.links.length, 2);
    assert.equal(result.links[1].label, "API");
});

test("overrides may introduce links absent from the base Compose", async () => {
    const result = await resolvedStackUrls("services: {}", async () => "x-dockge:\n  urls: [https://override.example]", true);
    assert.equal(result.links[0].url, "https://override.example/");
});

test("resolution failures and unsafe URLs never expose config or credentials", async () => {
    const result = await resolvedStackUrls("x-dockge:\n  urls: [\"https://${DOMAIN}\"]", async () => {
        throw new Error("secret-token");
    });
    assert.deepEqual(result, { links: [],
        unavailable: true });
    const unsafe = await resolvedStackUrls("x-dockge:\n  urls: [\"https://${DOMAIN}\"]", async () => "x-dockge:\n  urls: [\"javascript:alert(1)\", \"https://user:password@example.org\", \"https://${MISSING}\"]");
    assert.deepEqual(unsafe.links, []);
});

test("real Compose resolves global/local precedence, defaults and escaped dollars without running containers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "enhanced-url-env-"));
    try {
        const compose = "services:\n  web:\n    image: nginx\nx-dockge:\n  urls:\n    - url: https://${LINK_DOMAIN}/$${literal}/${LINK_PATH:-default}\n      label: Web\n";
        await writeFile(join(directory, "compose.yaml"), compose);
        await writeFile(join(directory, "global.env"), "LINK_DOMAIN=global.example\nLINK_PATH=shared\nPRIVATE_TOKEN=do-not-return\n");
        await writeFile(join(directory, ".env"), "LINK_DOMAIN=local.example\n");
        const result = await resolvedStackUrls(compose, async () => execFileSync("docker", [ "compose", "--env-file", "global.env", "--env-file", ".env", "config" ], { cwd: directory,
            encoding: "utf8",
            timeout: 15000 }));
        // Escaped placeholders remain literal, so the UI must not offer an unresolved link.
        assert.deepEqual(result.links, []);
        await writeFile(join(directory, "compose.yaml"), compose.replace("$${literal}/", ""));
        const valid = await resolvedStackUrls(compose, async () => execFileSync("docker", [ "compose", "--env-file", "global.env", "--env-file", ".env", "config" ], { cwd: directory,
            encoding: "utf8",
            timeout: 15000 }));
        assert.deepEqual(valid.links, [{ url: "https://local.example/shared",
            label: "Web" }]);
        assert.ok(!JSON.stringify(valid).includes("do-not-return"));
    } finally {
        await rm(directory, { recursive: true,
            force: true });
    }
});
