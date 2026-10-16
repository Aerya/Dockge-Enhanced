import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDockerStackResources, parseDockerBytes } from "./stack-resource-stats";

const container = (id: string, project: string, service = "web", state = "running") => JSON.stringify({ ID: id,
    Names: `/${project}-${service}-${id}`,
    Labels: `com.docker.compose.project=${project},com.docker.compose.service=${service}`,
    State: state });
const stat = (id: string, cpu: string, memory: string) => JSON.stringify({ ID: id,
    CPUPerc: cpu,
    MemUsage: `${memory} / 8GiB` });

test("Docker memory units include KiB without silently accepting unknown values", () => {
    assert.equal(parseDockerBytes("128KiB"), 128 * 1024);
    assert.equal(parseDockerBytes("1.5 MiB"), 1.5 * 1024 ** 2);
    assert.equal(parseDockerBytes("2GB"), 2 * 1000 ** 3);
    assert.equal(parseDockerBytes("0B"), 0);
    assert.equal(parseDockerBytes("N/A"), null);
    assert.equal(parseDockerBytes("128Unknown"), null);
});

test("sum services and replicas once, preserving CPU above 100 percent", () => {
    const ps = [ container("a".repeat(12), "custom-project"), container("b".repeat(12), "custom-project"), container("c".repeat(12), "custom-project", "db") ].join("\n");
    const first = stat("a".repeat(64), "120%", "128KiB");
    const stats = [ first, first, stat("b".repeat(12), "75%", "1MiB"), stat("c".repeat(12), "5%", "2MiB") ].join("\n");
    const result = aggregateDockerStackResources(stats, ps);
    assert.deepEqual(result.data["custom-project"], { cpu: 200,
        memUsed: 128 * 1024 + 3 * 1024 ** 2 });
    assert.equal(result.containerData["custom-project:web"].cpu, 195);
    assert.equal(result.containerData["custom-project:db"].cpu, 5);
    assert.equal(Object.keys(result.instances).length, 3);
    assert.equal(result.instances["a".repeat(12)].cpu, 120);
    assert.equal(result.instances["b".repeat(12)].cpu, 75);
});

test("an incomplete running stack is unavailable; stopped stacks are explicit zero", () => {
    const ps = [ container("a", "incomplete"), container("b", "incomplete"), container("c", "stopped", "web", "exited"), container("d", "complete") ].join("\n");
    const result = aggregateDockerStackResources([ stat("a", "1%", "1MiB"), stat("d", "2%", "2MiB") ].join("\n"), ps);
    assert.equal(result.data.incomplete, undefined);
    assert.equal(result.containerData["incomplete:web"], undefined);
    assert.deepEqual(result.data.stopped, { cpu: 0,
        memUsed: 0 });
    assert.equal(result.data.complete.cpu, 2);
});

test("missing or malformed readings never become invented zeros", () => {
    assert.deepEqual(aggregateDockerStackResources(stat("a", "N/A", "1MiB"), container("a", "app")).data, {});
    assert.deepEqual(aggregateDockerStackResources(stat("a", "1%", "N/A"), container("a", "app")).data, {});
    assert.throws(() => aggregateDockerStackResources("invalid json", ""));
    assert.deepEqual(aggregateDockerStackResources("", "").data, {});
});
