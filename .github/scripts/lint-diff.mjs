import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const requiredFullLint = new Set([
    "eslint.config.js",
    "eslint-suppressions.json",
    "package.json",
    "package-lock.json",
]);

function git(args, cwd) {
    return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function changedPaths(base, cwd) {
    const fields = git([ "diff", "--name-status", "-z", "--find-renames", base, "HEAD" ], cwd).split("\0");
    const changes = [];
    for (let index = 0; index < fields.length && fields[index];) {
        const status = fields[index++];
        const oldPath = fields[index++];
        const newPath = status.startsWith("R") || status.startsWith("C") ? fields[index++] : oldPath;
        changes.push({ status, oldPath, newPath });
    }
    return changes;
}

function diagnostics(source, result) {
    const lines = source.split(/\r?\n/);
    return result.messages.filter(message => message.severity === 2).map(message => ({
        ...message,
        fingerprint: JSON.stringify([
            message.ruleId,
            message.message,
            (lines[(message.line ?? 1) - 1] ?? "").trim(),
        ]),
    }));
}

function newErrors(baseSource, baseResult, headSource, headResult) {
    const prior = new Map();
    for (const diagnostic of baseResult ? diagnostics(baseSource, baseResult) : []) {
        prior.set(diagnostic.fingerprint, (prior.get(diagnostic.fingerprint) ?? 0) + 1);
    }
    return diagnostics(headSource, headResult).filter(diagnostic => {
        const count = prior.get(diagnostic.fingerprint) ?? 0;
        if (count === 0) return true;
        prior.set(diagnostic.fingerprint, count - 1);
        return false;
    });
}

export async function main(base, cwd = process.cwd()) {
    if (!base) {
        throw new Error("Usage : npm run lint:ci -- <SHA de la branche de base>");
    }
    git([ "rev-parse", "--verify", `${base}^{commit}` ], cwd);
    const changes = changedPaths(base, cwd);
    if (changes.some(change => requiredFullLint.has(change.oldPath) || requiredFullLint.has(change.newPath))) {
        console.log("Configuration ou dépendances ESLint modifiées : lint complet.");
        return spawnSync("npm", [ "run", "lint" ], { cwd, stdio: "inherit" }).status ?? 1;
    }

    const eslint = new ESLint({ cwd, applySuppressions: false });
    const results = [];
    let errorCount = 0;
    for (const change of changes) {
        if (change.status.startsWith("D") || !/\.(?:ts|vue)$/.test(change.newPath)) continue;
        const headPath = path.join(cwd, change.newPath);
        if (!fs.existsSync(headPath)) continue;
        const headSource = fs.readFileSync(headPath, "utf8");
        const [ headResult ] = await eslint.lintText(headSource, { filePath: headPath });
        if (!headResult) continue;
        const baseSource = change.status.startsWith("A")
            ? ""
            : git([ "show", `${base}:${change.oldPath}` ], cwd);
        const [ baseResult ] = change.status.startsWith("A")
            ? [ undefined ]
            : await eslint.lintText(baseSource, { filePath: path.join(cwd, change.oldPath) });
        const introduced = newErrors(baseSource, baseResult, headSource, headResult);
        errorCount += introduced.length;
        const messages = [ ...headResult.messages.filter(message => message.severity === 1), ...introduced ];
        if (messages.length) {
            results.push({ ...headResult,
                messages,
                errorCount: introduced.length,
                fixableErrorCount: introduced.filter(message => message.fix).length,
                fixableWarningCount: messages.filter(message => message.severity === 1 && message.fix).length });
        }
    }
    if (results.length) {
        const formatter = await eslint.loadFormatter("stylish");
        process.stdout.write(formatter.format(results));
    }
    console.log(`${errorCount} nouvelle(s) erreur(s) ESLint ; les avertissements restent non bloquants.`);
    return errorCount > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        process.exitCode = await main(process.argv[2]);
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}
