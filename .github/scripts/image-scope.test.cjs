const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const YAML = require("yaml");

test("only documentation and the exact report files bypass image builds", t => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "image-scope-"));
    t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
    const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    git("init", "-q");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    const script = path.join(__dirname, "is-image-independent.sh");
    const check = head => spawnSync("bash", [script, base, head], { cwd }).status;
    assert.notEqual(check("missing-revision"), 0);
    assert.notEqual(check(base), 0);
    for (const file of ["README.fr.md", ".github/scripts/usage-count.cjs", ".github/scripts/usage-count.test.cjs", ".github/workflows/usage-count-asset.yml"]) {
        fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
        fs.writeFileSync(path.join(cwd, file), "fixture");
    }
    git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "report");
    assert.equal(check("HEAD"), 0);
    for (const file of ["Dockerfile", "package.json", "extra/usage-periods.cjs", "backend/anonymous-install-count.ts", ".github/workflows/docker-pr.yml", ".trivyignore.yaml"]) {
        fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
        fs.writeFileSync(path.join(cwd, file), "fixture");
        git("add", ".");
        git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "runtime or CI");
        assert.notEqual(check("HEAD"), 0, file);
        assert.notEqual(spawnSync("bash", [script, "HEAD^", "HEAD"], { cwd }).status, 0, file);
    }
});

test("final Docker gate fails closed for missing detection or required skipped builds", () => {
    const wf = YAML.parse(fs.readFileSync(path.join(__dirname, "../workflows/docker-pr.yml"), "utf8"));
    const script = wf.jobs.build.steps[0].run;
    for (const [changes, independent, build, ok] of [
        ["success", "true", "skipped", true],
        ["success", "false", "success", true],
        ["success", "false", "skipped", false],
        ["success", "false", "failure", false],
        ["failure", "true", "skipped", false],
        ["skipped", "", "skipped", false],
        ["success", "", "success", false],
        ["success", "false", "cancelled", false],
    ]) {
        const result = spawnSync("bash", ["-e", "-c", script], { env: { ...process.env, CHANGES_RESULT: changes, IMAGE_INDEPENDENT: independent, BUILD_RESULT: build } });
        assert.equal(result.status === 0, ok, [changes, independent, build].join("/"));
    }
});
