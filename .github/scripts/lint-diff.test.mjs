import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./lint-diff.mjs", import.meta.url));
const dependencies = path.resolve(path.dirname(script), "../../node_modules");
const config = `import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
export default [{ files: ["**/*.ts"], ...js.configs.recommended,
  plugins: { "@stylistic": stylistic },
  rules: { ...js.configs.recommended.rules, "no-unused-vars": "off",
    "@stylistic/indent": ["error", 4] } }];
`;

function git(cwd, ...args) {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function verifyCase(name, baseline, update, expectedPass, extra = {}) {
    test(name, () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dockge-lint-diff-"));
        try {
            fs.symlinkSync(dependencies, path.join(directory, "node_modules"), "dir");
            fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module",
                scripts: { lint: "eslint '**/*.ts'" } }));
            fs.writeFileSync(path.join(directory, "eslint.config.js"), config);
            fs.writeFileSync(path.join(directory, "legacy.ts"), baseline);
            git(directory, "init", "-q");
            git(directory, "config", "user.name", "Lint fixture");
            git(directory, "config", "user.email", "lint-fixture@example.invalid");
            git(directory, "add", ".");
            git(directory, "commit", "-qm", "base");
            const base = git(directory, "rev-parse", "HEAD");
            fs.writeFileSync(path.join(directory, "legacy.ts"), update);
            for (const [ file, source ] of Object.entries(extra)) {
                fs.writeFileSync(path.join(directory, file), source);
            }
            git(directory, "add", ".");
            git(directory, "commit", "-qm", "head");
            const result = spawnSync(process.execPath, [ script, base ], { cwd: directory,
                encoding: "utf8" });
            assert.equal(result.status === 0, expectedPass, `${result.stdout}\n${result.stderr}`);
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
}

const debt = "function legacy() {\n  return 1;\n}\n";
verifyCase("A : modification propre d'un vieux fichier endetté", debt, `${debt}// commentaire propre\n`, true);
verifyCase("B : nouvelle erreur dans un vieux fichier", debt, `${debt}missingValue;\n`, false);
verifyCase("C : nouveau fichier non conforme", debt, debt, false, { "new.ts": "missingValue;\n" });
verifyCase("D : suppression d'une ancienne erreur", debt, "function legacy() {\n    return 1;\n}\n", true);
verifyCase("E : déplacement de lignes sans erreur ajoutée", "function one() {\n  return 1;\n}\nfunction two() {\n  return 2;\n}\n", "function two() {\n  return 2;\n}\nfunction one() {\n  return 1;\n}\n", true);
verifyCase("F : modification de la configuration force le lint complet", debt, debt, false,
    { "eslint.config.js": `${config}\n// configuration modifiée\n` });
