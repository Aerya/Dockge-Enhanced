import { createHash } from "node:crypto";
import { Settings } from "../settings";
import { ImageWatcher } from "../watchers/image-watcher";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";
import { getNotificationLang, notificationText } from "../notification/notification-lang";
import type { HostSecurity } from "./security";
export function hostAlertKey(state: string, reboot: string, security: HostSecurity) {
    return createHash("sha256").update(JSON.stringify([ state, reboot, security.state,
        security.findings.filter(v => [ "HIGH", "CRITICAL" ].includes(v.severity)).map(v => `${v.id}:${v.pkg}:${v.fix}`).sort() ])).digest("hex");
}
export async function notifyHost(state: string, reboot: string, security: HostSecurity, eventId = "") {
    const key = hostAlertKey(state + eventId, reboot, security);
    const previous = await Settings.get("hostAlert");
    if (previous?.key === key || (previous?.at && Date.now() - previous.at < 3600000)) {
        return;
    }
    const count = security.findings.filter(v => [ "HIGH", "CRITICAL" ].includes(v.severity)).length;
    if (state === "fresh" && reboot !== "required" && count === 0 && security.state !== "stale") {
        return;
    }
    const config = ImageWatcher.getInstance().settings;
    if (!config.discordWebhooks.length && !config.appriseServerUrl) {
        return;
    }
    const lang = await getNotificationLang();
    const title = notificationText(lang, "Gestion des hôtes (Bêta)", "Host Management (Beta)", "Gestión de hosts (Beta)", "主机管理（测试版）");
    const body = notificationText(lang, "L’état de l’hôte a changé. Consulter /watcher/hosts.", "Host status changed. Check /watcher/hosts.", "El estado del host ha cambiado. Consulte /watcher/hosts.", "主机状态已改变。请检查 /watcher/hosts。") + `\n${state} · ${reboot} · HIGH/CRITICAL: ${count}`;
    const results = await Promise.all([
        new DiscordNotifier(config.discordWebhooks).sendEmbed({ title,
            description: body }),
        new AppriseNotifier(config.appriseServerUrl, config.appriseUrls).send({ title,
            body,
            type: "warning" }),
    ]);
    if (results.some(Boolean)) {
        await Settings.set("hostAlert", { key,
            at: Date.now() });
    }
}
