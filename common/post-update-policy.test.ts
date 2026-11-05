import assert from "node:assert/strict";
import test from "node:test";
import { postUpdatePolicy, postUpdateCleanupDue, POST_UPDATE_CLEANUP, POST_UPDATE_ROLLBACK, ROLLBACK_RETENTION_MS } from "./post-update-policy";
import { setComposeLabel } from "./compose-labels";

test("cleanup and rollback are independent and both enabled by default", () => {
    assert.deepEqual(postUpdatePolicy(), { cleanup: true,
        rollback: true });
    for (const cleanup of [ true, false ]) {
        for (const rollback of [ true, false ]) {
            const object = { [POST_UPDATE_CLEANUP]: String(cleanup),
                [POST_UPDATE_ROLLBACK]: String(rollback) };
            const list = Object.entries(object).map(([ key, value ]) => `${key}=${value}`);
            assert.deepEqual(postUpdatePolicy(object), { cleanup,
                rollback });
            assert.deepEqual(postUpdatePolicy(list), { cleanup,
                rollback });
            assert.equal(postUpdateCleanupDue({ cleanup,
                rollback }, 100), cleanup ? 100 + (rollback ? ROLLBACK_RETENTION_MS : 0) : null);
        }
    }
});

test("invalid options never authorize cleanup or disable rollback protection", () => {
    assert.deepEqual(postUpdatePolicy({ [POST_UPDATE_CLEANUP]: "invalid",
        [POST_UPDATE_ROLLBACK]: "invalid" }), { cleanup: false,
        rollback: true });
    assert.throws(() => postUpdateCleanupDue(postUpdatePolicy(), NaN));
});

test("editing options preserves unrelated labels in both Compose representations", () => {
    for (const labels of [{ "example.keep": "yes" }, [ "example.keep=yes" ]]) {
        const service = { labels };
        setComposeLabel(service, POST_UPDATE_CLEANUP, "false");
        setComposeLabel(service, POST_UPDATE_ROLLBACK, "true");
        assert.deepEqual(postUpdatePolicy(service.labels), { cleanup: false,
            rollback: true });
        assert.equal(Array.isArray(service.labels) ? service.labels.includes("example.keep=yes") : service.labels["example.keep"], Array.isArray(service.labels) ? true : "yes");
    }
});
