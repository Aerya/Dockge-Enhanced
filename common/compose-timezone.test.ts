import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "yaml";
import { prepareComposeTimezone } from "./compose-timezone";

test("map/list environments keep other variables, labels, interpolation and comments", () => {
    const source = "# keep\nservices:\n  web:\n    image: nginx:${TAG}\n    labels: {keep: yes}\n    environment:\n      OTHER: \"123\" # variable\n  worker:\n    image: busybox\n    environment: [OTHER=abc, TZ=UTC, TZ=Asia/Shanghai]\n";
    const result = prepareComposeTimezone(source, "", "Europe/Paris");
    const services = parse(result.compose).services;
    assert.deepEqual(result.conflicts, [ "worker" ]);
    assert.equal(services.web.environment.TZ, "Europe/Paris");
    assert.equal(services.web.environment.OTHER, "123");
    assert.deepEqual(services.web.labels, { keep: "yes" });
    assert.equal(services.web.image, "nginx:${TAG}");
    assert.deepEqual(services.worker.environment, [ "OTHER=abc", "TZ=Europe/Paris" ]);
    assert.match(result.compose, /# keep/);
    assert.match(result.compose, /# variable/);
    assert.equal(source.includes("Europe/Paris"), false, "preparing does not mutate the input before consent");
});

test("existing TZ requires consent even for equal, empty or interpolated values", () => {
    for (const environment of [ "{TZ: UTC}", "{TZ: Europe/Paris}", "{TZ: null}", "[TZ]", "[TZ=]", "[\"TZ=${MY_TZ}\"]" ]) {
        assert.deepEqual(prepareComposeTimezone(`services:\n  app:\n    environment: ${environment}\n`, "", "Europe/Paris").conflicts, [ "app" ]);
    }
});

test("inherited environment and env_file/extends trigger consent; anchors remain valid", () => {
    const source = "x-env: &env\n  OTHER: test\n  TZ: UTC\nx-service: &service\n  environment: *env\nservices:\n  a:\n    <<: *service\n  b:\n    environment: *env\n  c:\n    env_file: .env\n  d:\n    extends: {file: common.yml, service: app}\n";
    const result = prepareComposeTimezone(source, "", "Europe/Paris");
    const parsed = parse(result.compose, { merge: true });
    assert.deepEqual(result.conflicts, [ "a", "b", "c", "d" ]);
    assert.equal(parsed.services.a.environment.TZ, "Europe/Paris");
    assert.equal(parsed.services.b.environment.OTHER, "test");
    assert.equal(parsed["x-env"].TZ, "UTC");
});

test("overrides are updated too and unrelated override sections are preserved", () => {
    const source = "services:\n  app:\n    image: test\n";
    const result = prepareComposeTimezone(source, "services:\n  app:\n    environment: {TZ: UTC, KEEP: yes}\n", "Europe/Paris");
    assert.deepEqual(result.conflicts, [ "app" ]);
    assert.deepEqual(parse(result.override).services.app.environment, { TZ: "Europe/Paris",
        KEEP: "yes" });
    const unrelated = "volumes:\n  cache: {}\n";
    assert.equal(prepareComposeTimezone(source, unrelated, "UTC").override, unrelated);
});

test("invalid or unsupported drafts and timezones are rejected without returning partial changes", () => {
    for (const source of [ "", "services: {}", "services: [", "services: []", "services:\n  app:\n    environment: broken\n", "x: &a {image: test}\nservices: {app: *a}\n" ]) {
        assert.throws(() => prepareComposeTimezone(source, "", "UTC"));
    }
    assert.throws(() => prepareComposeTimezone("services: {app: {}}", "services: [", "UTC"));
    assert.throws(() => prepareComposeTimezone("services: {app: {}}", "", "bad/timezone"));
});
