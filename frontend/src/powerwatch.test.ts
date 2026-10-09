import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatPowerWatts, resolvePowerWatchWebUrl } from "./powerwatch";

test("formatPowerWatts handles watts, locale and kW", () => {
    assert.equal(formatPowerWatts(0, "fr-FR"), "0 W");
    assert.equal(formatPowerWatts(7.34, "fr-FR"), "7,3 W");
    assert.equal(formatPowerWatts(42.75, "en"), "42.8 W");
    assert.equal(formatPowerWatts(1250, "fr-FR"), "1,25 kW");
    assert.equal(formatPowerWatts(null, "fr-FR"), "—");
    assert.equal(formatPowerWatts(Number.NaN), "—");
});

test("resolvePowerWatchWebUrl preserves custom URLs and reverse proxy paths", () => {
    assert.equal(resolvePowerWatchWebUrl("https://power.example.lan/reverse/powerwatch", "dockge.lan"), "https://power.example.lan/reverse/powerwatch");
    assert.equal(resolvePowerWatchWebUrl("http://192.168.0.53:3064", "dockge.lan"), "http://192.168.0.53:3064");
});

test("resolvePowerWatchWebUrl rewrites loopback for local and remote instances", () => {
    assert.equal(resolvePowerWatchWebUrl("http://127.0.0.1:3064", "192.168.0.139"), "http://192.168.0.139:3064");
    assert.equal(resolvePowerWatchWebUrl("http://0.0.0.0:3064/path", "local", "https://192.168.0.196:5001"), "http://192.168.0.196:3064/path");
    assert.equal(resolvePowerWatchWebUrl("http://[::1]:3064", "2001:db8::2"), "http://[2001:db8::2]:3064");
    assert.equal(resolvePowerWatchWebUrl("javascript:alert(1)", "localhost"), null);
    assert.equal(resolvePowerWatchWebUrl(null, "localhost"), null);
});

test("system statistics show only the PowerWatch watt value", () => {
    const component = readFileSync(new URL("./components/SystemStatsBar.vue", import.meta.url), "utf8");
    assert.match(component, /formatPower\(powerWatchSnapshot\.totalWatts\)/);
    assert.doesNotMatch(component, /powerwatch-label/);
    assert.match(component, /:title="powerWatchTooltip"/);
});

test("linked instances keep the individual PowerWatch link in the resource row", () => {
    const component = readFileSync(new URL("./pages/DashboardHome.vue", import.meta.url), "utf8");
    assert.match(component, /class="instance-powerwatch-link"/);
    assert.match(component, /class="instance-overview-select"/);
    assert.match(component, /class="instance-resource-select"/);
    assert.doesNotMatch(component, /instance-powerwatch-hub-link/);
});

test("PowerWatch Hub is global and follows Kula and Dozzle", () => {
    const component = readFileSync(new URL("./components/SystemStatsBar.vue", import.meta.url), "utf8");
    const layout = readFileSync(new URL("./layouts/Layout.vue", import.meta.url), "utf8");
    assert.match(component, /powerWatchHubUrl/);
    assert.ok(component.indexOf("powerWatchUrl") < component.indexOf("temperature-half"));
    assert.ok(component.indexOf("dozzleUrl") < component.indexOf("powerWatchHubUrl"));
    assert.match(layout, /\/api\/watcher\/powerwatch\/hub\/status/);
});
