import test from "node:test";
import assert from "node:assert/strict";
import { nextRegistryTagsPage, parseVersionTag, selectVersionCandidates } from "./image-version-preview";

test("floating, digest, ambiguous and prerelease tags are never guessed", () => {
    for (const tag of [ "latest", "stable", "sha256:abc", "1.2.3.4", "1.2.3-rc1", "1.2.3-beta.1", "01.2.3", "999999999999999999999.0.0" ]) {
        assert.equal(parseVersionTag(tag), null, tag);
    }
    assert.equal(selectVersionCandidates("latest", [ "99.0.0" ]).sameMajor, null);
});

test("numeric ordering, same variant, nearest higher major; no safe-update promise", () => {
    const result = selectVersionCandidates("1.2.3-alpine", [ "1.10.0-alpine", "1.9.0-alpine", "1.11.0", "2.3.0-alpine", "2.4.0-alpine", "3.0.0-alpine", "2.9.0-alpine-rc1" ]);
    assert.equal(result.sameMajor, "1.10.0-alpine");
    assert.equal(result.nextMajor, "2.4.0-alpine");
    assert.equal(selectVersionCandidates("15", [ "15.2.0", "18.0.0" ]).sameMajor, "15.2.0");
});

test("pagination preserves origin and repository, rejects credential leaks", () => {
    const first = new URL("https://registry.example/v2/team/app/tags/list?n=100");
    assert.equal(nextRegistryTagsPage("</v2/team/app/tags/list?n=100&last=v1>; rel=\"next\"", first, first)?.searchParams.get("last"), "v1");
    for (const url of [ "https://evil.example/v2/team/app/tags/list", "/v2/other/tags/list", "https://user:password@registry.example/v2/team/app/tags/list" ]) {
        assert.throws(() => nextRegistryTagsPage(`<${url}>; rel="next"`, first, first));
    }
    assert.equal(nextRegistryTagsPage("", first, first), null);
});
