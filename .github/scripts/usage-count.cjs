const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { periods, periodStart } = require("../../extra/usage-periods.cjs");

function assetsToPrepare(now) {
    const nextWeek = new Date(now.getTime() + 7 * 86400000);
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const nextYear = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
    return [...new Set([...Object.values(periods(now)), periods(nextWeek).week, periods(nextMonth).month, periods(nextYear).year])];
}

function report(assets, now = new Date()) {
    const current = periods(now);
    const week = periods(new Date(now.getTime() - 7 * 86400000)).week;
    const lookup = new Map(assets.map(asset => [asset.name.replace(/\.txt$/, ""), asset]));
    const describe = key => {
        const asset = lookup.get(key);
        return asset ? `**${asset.downloadCount}**` : "N/D";
    };
    const months = assets.filter(asset => /^\d{4}-(0[1-9]|1[0-2])\.txt$/.test(asset.name) && asset.name.slice(0, 7) <= current.month);
    const yearMonths = months.filter(asset => asset.name.startsWith(`${now.getUTCFullYear()}-`));
    const annualTotal = yearMonths.length ? `**${yearMonths.reduce((sum, asset) => sum + asset.downloadCount, 0)}**` : "N/D";
    const end = new Date(Date.parse(periodStart(week)) + 6 * 86400000).toISOString().slice(0, 10);
    const lines = [
        `Semaine écoulée (${week.slice(5)} → ${end}, UTC) : ${describe(week)}`,
        `Mois en cours (${current.month}) : ${describe(current.month)}`,
        `Cumul ${now.getUTCFullYear()} (somme des mois) : ${annualTotal}`,
        "",
        "**Mois précédents**",
        ...months.filter(asset => asset.name.slice(0, 7) < current.month)
            .sort((a, b) => b.name.localeCompare(a.name)).map(asset => `${asset.name.slice(0, 7)} : ${describe(asset.name.slice(0, 7))}`),
    ];
    const pages = [""];
    for (const line of lines) {
        if (pages[pages.length - 1].length + line.length > 3500) pages.push("");
        pages[pages.length - 1] += `${line}\n\n`;
    }
    return pages.map(description => ({ username: "Dockge Enhanced", embeds: [{ title: "Dockge-Enhanced — installations estimées par période", description, color: 5793266, timestamp: now.toISOString() }] }));
}

async function main() {
    const now = new Date();
    const repo = process.env.GITHUB_REPOSITORY;
    const gh = args => execFileSync("gh", [...args, "--repo", repo], { encoding: "utf8" });
    const list = () => JSON.parse(gh(["release", "view", "usage-count", "--json", "assets"])).assets;
    // API/authentication failures must not recreate or overwrite historical assets.
    const known = new Set(list().map(asset => asset.name));
    for (const key of assetsToPrepare(now)) {
        if (known.has(`${key}.txt`)) continue;
        const file = path.join(process.env.RUNNER_TEMP, `${key}.txt`);
        fs.writeFileSync(file, `Dockge-Enhanced anonymous count ${key}\n`);
        gh(["release", "upload", "usage-count", file]);
    }
    const payloads = report(list(), now);
    fs.writeFileSync(path.join(process.env.RUNNER_TEMP, "usage-count-report.json"), JSON.stringify(payloads, null, 2));
    if (process.env.SEND_REPORT !== "true") return;
    const webhook = process.env.DISCORD_WEBHOOK;
    if (!webhook) {
        throw new Error("Secret Discord absent : envoi impossible, rapport conservé dans l’artefact Actions.");
    }
    if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(webhook)) throw new Error("Invalid Discord webhook");
    for (const payload of payloads) {
        try {
            const response = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error();
        } catch {
            throw new Error("Discord delivery failed; webhook and response omitted for privacy");
        }
    }
    console.log(`Rapport accepté par Discord (${payloads.length} message(s)).`);
}

module.exports = { assetsToPrepare, report };
if (require.main === module) main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
