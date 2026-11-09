const test = require("node:test");
const assert = require("node:assert/strict");
const { report, assetsToPrepare } = require("./usage-count.cjs");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("workflow prepares assets without replacing counts or downloading them", t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-report-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const fixture = [{ name: `${month}.txt`, downloadCount: 753, createdAt: now.toISOString() }];
    fs.writeFileSync(path.join(dir, "assets.json"), JSON.stringify(fixture));
    fs.writeFileSync(path.join(dir, "gh"), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const file = process.env.RUNNER_TEMP + '/assets.json';
const assets = JSON.parse(fs.readFileSync(file));
if (args[0] !== 'release') process.exit(2);
if (args[1] === 'view') console.log(JSON.stringify({assets}));
else if (args[1] === 'upload') {
    const name = require('node:path').basename(args[3]);
    if (args.includes('--clobber') || assets.some(a => a.name === name)) process.exit(3);
    assets.push({name, downloadCount: 0, createdAt: new Date().toISOString()});
    fs.writeFileSync(file, JSON.stringify(assets));
} else process.exit(4);
`, { mode: 0o700 });
    for (let i = 0; i < 2; i++) {
        const run = spawnSync(process.execPath, [path.join(__dirname, "usage-count.cjs")], {
            encoding: "utf8",
            env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RUNNER_TEMP: dir, GITHUB_REPOSITORY: "fixture/repository", SEND_REPORT: "false", DISCORD_WEBHOOK: "" },
        });
        assert.equal(run.status, 0, run.stderr);
    }
    const saved = JSON.parse(fs.readFileSync(path.join(dir, "assets.json")));
    assert.equal(saved.find(a => a.name === `${month}.txt`).downloadCount, 753);
    assert.equal(saved.length, assetsToPrepare(now).length);
    assert.match(fs.readFileSync(path.join(dir, "usage-count-report.json"), "utf8"), /753/);
    const missingSecret = spawnSync(process.execPath, [path.join(__dirname, "usage-count.cjs")], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RUNNER_TEMP: dir, GITHUB_REPOSITORY: "fixture/repository", SEND_REPORT: "true", DISCORD_WEBHOOK: "" },
    });
    assert.equal(missingSecret.status, 1);
    assert.match(missingSecret.stderr, /Secret Discord absent/);
    assert.ok(fs.existsSync(path.join(dir, "usage-count-report.json")));
});

test("workflow separates daily preparation and Paris evening reports without execution-date gating", t => {
    const workflow = require("yaml").parse(fs.readFileSync(path.join(__dirname, "../workflows/usage-count-asset.yml"), "utf8"));
    assert.deepEqual(workflow.on.schedule, [
        { cron: "17 8 * * *" },
        { cron: "0 20 * * 1,3,6", timezone: "Europe/Paris" },
    ]);
    const step = workflow.jobs["usage-count"].steps.find(s => s.id === "report");
    assert.equal(step.env.EVENT_SCHEDULE, "${{ github.event.schedule }}");
    assert.doesNotMatch(step.run, /date /);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-schedule-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    for (const [event, schedule, expected] of [
        ["schedule", "17 8 * * *", false],
        ["schedule", "0 20 * * 1,3,6", true],
        ["workflow_dispatch", "", true],
        ["push", "", false],
    ]) {
        const output = path.join(dir, "output");
        fs.writeFileSync(output, "");
        const run = spawnSync("bash", ["-e", "-c", step.run], { encoding: "utf8", env: { ...process.env, EVENT_NAME: event, EVENT_SCHEDULE: schedule, GITHUB_OUTPUT: output } });
        assert.equal(run.status, 0, run.stderr);
        assert.equal(fs.readFileSync(output, "utf8").trim(), `send=${expected}`);
    }
    for (const [instant, hour] of [["2026-01-05T19:00:00Z", "20"], ["2026-07-06T18:00:00Z", "20"]]) {
        assert.equal(new Intl.DateTimeFormat("fr-FR", { timeZone: workflow.on.schedule[1].timezone, hour: "2-digit" }).format(new Date(instant)), `${hour} h`);
    }
});

test("prepare next UTC week, month and year before boundaries", () => {
    const keys = assetsToPrepare(new Date("2026-12-31T23:00:00Z"));
    for (const key of ["2026-12", "2027-01", "year-2026", "year-2027", "week-2026-12-28", "week-2027-01-04"]) assert.ok(keys.includes(key));
});

test("report does not confuse previous week, months or annual sum", () => {
    const assets = [
        { name: "2026-10.txt", downloadCount: 753, createdAt: "2026-10-01T15:00:00Z" },
        { name: "2026-11.txt", downloadCount: 564, createdAt: "2026-11-01T15:00:00Z" },
        { name: "week-2026-10-26.txt", downloadCount: 400, createdAt: "2026-10-20T00:00:00Z" },
        { name: "year-2026.txt", downloadCount: 600, createdAt: "2026-11-01T15:00:00Z" },
    ];
    const text = JSON.stringify(report(assets, new Date("2026-11-02T12:00:00Z")));
    assert.match(text, /2026-10-26 → 2026-11-01/);
    assert.match(text, /Année en cours \(2026\) : \*\*600\*\*/);
    assert.match(text, /2026-10 : \*\*753\*\*/);
    assert.match(text, /période partielle/);
    assert.doesNotMatch(text, /1317/);
    assert.match(JSON.stringify(report([], new Date("2026-11-02"))), /non disponible/);
});

test("every past month remains listed within Discord size limits", () => {
    const assets = Array.from({ length: 300 }, (_, i) => ({ name: `${2000 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}.txt`, downloadCount: i, createdAt: "1999-01-01T00:00:00Z" }));
    const pages = report(assets, new Date("2026-11-02"));
    assert.ok(pages.length > 1);
    for (const page of pages) assert.ok(page.embeds[0].description.length < 4096);
    for (const asset of assets) assert.ok(JSON.stringify(pages).includes(asset.name.slice(0, 7)));
});
