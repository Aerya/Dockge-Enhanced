import test from "node:test";
import assert from "node:assert/strict";
import { captureServiceImageTargets, resolveServiceImageTargets, verifyServiceImageTargets } from "./image-update-verification";

const old = `sha256:${"a".repeat(64)}`;
const next = `sha256:${"b".repeat(64)}`;
const replica = (service: string, image = next, running = true) => ({ Image: image,
    State: { Running: running },
    Config: { Labels: { "com.docker.compose.service": service } } });
function fixture() {
    const state = { app: [ replica("app", old), replica("app", old) ],
        browser: [ replica("browser", old) ] };
    const compose = async (args: string[]) => args.includes("config")
        ? JSON.stringify({ services: { app: { image: "fixture/app:latest" },
            browser: { image: "fixture/browser:latest" } } })
        : state[args.at(-1) as keyof typeof state].map((_, i) => `${args.at(-1)}-${i}`).join("\n");
    const docker = async (args: string[]) => args[0] === "image" ? next
        : args.slice(4).map(id => {
            const [ name, index ] = id.split("-");
            return JSON.stringify(state[name as keyof typeof state][Number(index)]);
        }).join("\n");
    return { state,
        compose,
        docker };
}

test("a successful Compose exit with only browser recreated is rejected", async () => {
    const f = fixture();
    const targets = await captureServiceImageTargets(f.compose, f.docker, [ "app", "browser" ]);
    await resolveServiceImageTargets(targets, f.docker);
    f.state.browser = [ replica("browser") ];
    await assert.rejects(verifyServiceImageTargets(targets, f.compose, f.docker), /app.*expected image/);
    f.state.app = [ replica("app"), replica("app") ];
    await verifyServiceImageTargets(targets, f.compose, f.docker);
});

test("each replica must exist, run and use the captured immutable ID", async () => {
    const f = fixture();
    const targets = await captureServiceImageTargets(f.compose, f.docker, [ "app" ]);
    await resolveServiceImageTargets(targets, f.docker);
    for (const replicas of [[], [ replica("app") ], [ replica("app"), replica("app", old) ],
        [ replica("app"), replica("app", next, false) ], [ replica("app"), replica("other") ]]) {
        f.state.app = replicas;
        await assert.rejects(verifyServiceImageTargets(targets, f.compose, f.docker));
    }
});

test("inspection failure and malformed output cannot become successful verification", async () => {
    const f = fixture();
    const targets = await captureServiceImageTargets(f.compose, f.docker, [ "app" ]);
    await assert.rejects(resolveServiceImageTargets(targets, async () => ""), /Cannot resolve/);
    await assert.rejects(verifyServiceImageTargets(targets, f.compose, async () => "invalid JSON"));
    await assert.rejects(verifyServiceImageTargets(targets, f.compose, async () => {
        throw new Error("Docker unavailable");
    }), /Docker unavailable/);
});
