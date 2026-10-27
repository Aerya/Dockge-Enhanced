import type { PruneImageDecision, PruneImageOutcome } from "../watchers/auto-prune-manager";

export type CleanupCategory = "images" | "networks" | "volumes" | "buildCache" | "containers";
export type CleanupEvent = "started" | "completed" | "partial" | "deferred" | "failed";
export interface CleanupCategorySummary {
    removed?: number;
    imagePasses?: { kind: "dangling" | "unused";
        counts: Partial<Record<PruneImageOutcome, number>> }[];
    reclaimed?: string;
    legacyWarning?: boolean;
    excluded?: boolean;
    failed?: boolean;
}
export type CleanupSummaries = Partial<Record<CleanupCategory, CleanupCategorySummary>>;

const messages = {
    en: {
        automatic: "Automatic",
        manual: "Manual",
        removedCount: "Removed",
        started: "Automatic cleanup started",
        completed: "Automatic cleanup completed",
        partial: "Automatic cleanup partially completed",
        deferred: "Automatic cleanup deferred",
        failed: "Automatic cleanup failed",
        images: "Images",
        networks: "Networks",
        volumes: "Volumes",
        buildCache: "Build cache",
        containers: "Containers",
        dangling: "Untagged",
        unused: "Unused",
        removed: "removed",
        used: "in use",
        active: "active",
        rollback: "rollback",
        recovery: "recovery",
        tooRecent: "too recent",
        excluded: "excluded",
        alreadyAbsent: "already absent",
        error: "errors",
        reclaimed: "reclaimed",
        done: "Completed",
        failure: "An operation failed; see history",
        legacy: "Legacy builder warning; check Buildx availability",
        details: "Details: Resources → Cleanup (Images for the image report).",
        duration: "Duration",
        categories: "Categories",
    },
    fr: {
        automatic: "automatique",
        manual: "manuel",
        removedCount: "Supprimés",
        started: "Nettoyage automatique démarré",
        completed: "Nettoyage automatique terminé",
        partial: "Nettoyage automatique partiellement terminé",
        deferred: "Nettoyage automatique reporté",
        failed: "Échec du nettoyage automatique",
        images: "Images",
        networks: "Réseaux",
        volumes: "Volumes",
        buildCache: "Cache de construction",
        containers: "Conteneurs",
        dangling: "Sans tag",
        unused: "Inutilisées",
        removed: "supprimées",
        used: "utilisées",
        active: "actives",
        rollback: "rollback",
        recovery: "récupération",
        tooRecent: "trop récentes",
        excluded: "exclues",
        alreadyAbsent: "déjà absentes",
        error: "erreurs",
        reclaimed: "libérés",
        done: "Terminé",
        failure: "Une opération a échoué ; voir l’historique",
        legacy: "Avertissement de l’ancien builder ; vérifier la disponibilité de Buildx",
        details: "Détails : Ressources → Nettoyage (Images pour le rapport des images).",
        duration: "Durée",
        categories: "Catégories",
    },
    de: {
        automatic: "Automatische",
        manual: "Manuelle",
        removedCount: "Entfernt",
        started: "Automatische Bereinigung gestartet",
        completed: "Automatische Bereinigung abgeschlossen",
        partial: "Automatische Bereinigung teilweise abgeschlossen",
        deferred: "Automatische Bereinigung verschoben",
        failed: "Automatische Bereinigung fehlgeschlagen",
        images: "Images",
        networks: "Netzwerke",
        volumes: "Volumes",
        buildCache: "Build-Cache",
        containers: "Container",
        dangling: "Ohne Tag",
        unused: "Unbenutzt",
        removed: "entfernt",
        used: "verwendet",
        active: "aktiv",
        rollback: "Rollback",
        recovery: "Wiederherstellung",
        tooRecent: "zu neu",
        excluded: "ausgeschlossen",
        alreadyAbsent: "bereits entfernt",
        error: "Fehler",
        reclaimed: "freigegeben",
        done: "Abgeschlossen",
        failure: "Ein Vorgang ist fehlgeschlagen; siehe Verlauf",
        legacy: "Warnung des alten Builders; Buildx-Verfügbarkeit prüfen",
        details: "Details: Ressourcen → Bereinigung (Images für den Image-Bericht).",
        duration: "Dauer",
        categories: "Kategorien",
    },
    es: {
        automatic: "automática",
        manual: "manual",
        removedCount: "Eliminados",
        started: "Limpieza automática iniciada",
        completed: "Limpieza automática completada",
        partial: "Limpieza automática parcialmente completada",
        deferred: "Limpieza automática aplazada",
        failed: "Error de limpieza automática",
        images: "Imágenes",
        networks: "Redes",
        volumes: "Volúmenes",
        buildCache: "Caché de compilación",
        containers: "Contenedores",
        dangling: "Sin etiqueta",
        unused: "Sin uso",
        removed: "eliminadas",
        used: "en uso",
        active: "activas",
        rollback: "rollback",
        recovery: "recuperación",
        tooRecent: "demasiado recientes",
        excluded: "excluidas",
        alreadyAbsent: "ya ausentes",
        error: "errores",
        reclaimed: "liberados",
        done: "Completado",
        failure: "Una operación ha fallado; consulta el historial",
        legacy: "Aviso del builder antiguo; comprueba la disponibilidad de Buildx",
        details: "Detalles: Recursos → Limpieza (Imágenes para el informe de imágenes).",
        duration: "Duración",
        categories: "Categorías",
    },
    "zh-CN": {
        automatic: "自动",
        manual: "手动",
        removedCount: "已删除",
        started: "自动清理已开始",
        completed: "自动清理已完成",
        partial: "自动清理部分完成",
        deferred: "自动清理已推迟",
        failed: "自动清理失败",
        images: "镜像",
        networks: "网络",
        volumes: "卷",
        buildCache: "构建缓存",
        containers: "容器",
        dangling: "无标签",
        unused: "未使用",
        removed: "已删除",
        used: "使用中",
        active: "运行镜像",
        rollback: "回滚保护",
        recovery: "恢复保护",
        tooRecent: "过新",
        excluded: "已排除",
        alreadyAbsent: "已不存在",
        error: "错误",
        reclaimed: "已释放",
        done: "已完成",
        failure: "操作失败，请查看历史记录",
        legacy: "旧构建器警告，请检查 Buildx 是否可用",
        details: "详情：资源 → 清理（镜像报告请查看“镜像”）。",
        duration: "耗时",
        categories: "类别",
    },
};

export function imageCleanupCounts(decisions: PruneImageDecision[]): Partial<Record<PruneImageOutcome, number>> {
    const counts: Partial<Record<PruneImageOutcome, number>> = {};
    for (const { outcome } of decisions) {
        counts[outcome] = (counts[outcome] ?? 0) + 1;
    }
    return counts;
}

/** Keep command output in history; only a validated size and a warning flag enter notifications. */
export function buildCacheCleanupSummary(output: string): CleanupCategorySummary {
    const reclaimed = output.match(/^Total reclaimed space:\s*(\d+(?:\.\d+)?\s*(?:[kMGTPE]?B|[KMGTPE]iB))\s*$/m)?.[1];
    return { reclaimed,
        legacyWarning: output.includes("DEPRECATED: The legacy builder is deprecated") };
}

export function cleanupNotification(input: {
    event: CleanupEvent;
    automatic?: boolean;
    hostname: string;
    language: string;
    categories: CleanupCategory[];
    summaries?: CleanupSummaries;
    durationSeconds?: number;
    reason?: string;
}) {
    const locale = input.language.toLowerCase();
    const language = locale.startsWith("zh") ? "zh-CN" : locale.split("-")[0];
    const t = messages[language as keyof typeof messages] ?? messages.en;
    const host = input.hostname.replace(/[\r\n[\]]/g, " ").trim().slice(0, 100);
    const icon = input.event === "completed" ? "✅" : input.event === "failed" ? "❌" : input.event === "started" ? "🧹" : "⚠️";
    const eventTitle = input.automatic === false ? t[input.event].replace(t.automatic, t.manual) : t[input.event];
    const title = `${host ? `[${host}] ` : "Dockge-Enhanced — "}${icon} ${eventTitle}`;
    const lines: string[] = [];
    for (const category of input.categories) {
        const summary = input.summaries?.[category];
        if (!summary) {
            continue;
        }
        const values: string[] = [];
        if (summary.imagePasses) {
            for (const pass of summary.imagePasses) {
                const counts = Object.entries(pass.counts).filter(([ , count ]) => count > 0)
                    .map(([ key, count ]) => `${t[key as PruneImageOutcome]} : ${count}`);
                values.push(`${t[pass.kind]} : ${counts.length ? counts.join(" · ") : `0 ${t.removed}`}`);
            }
        } else if (summary.removed !== undefined) {
            values.push(`${t.removedCount} : ${summary.removed}`);
        }
        if (summary.reclaimed) {
            values.push(`${summary.reclaimed} ${t.reclaimed}`);
        }
        if (summary.excluded) {
            values.push(t.excluded);
        }
        if (summary.failed) {
            values.push(t.failure);
        }
        if (summary.legacyWarning) {
            values.push(t.legacy);
        }
        lines.push(`**${t[category]}**\n${values.length ? values.join("\n") : t.done}`);
    }
    if (!lines.length && input.event === "started") {
        lines.push(`${t.categories} : ${input.categories.map(category => t[category]).join(", ")}`);
    }
    if (input.reason) {
        lines.push(input.reason.replace(/\s+/g, " ").slice(0, 300));
    }
    if (input.durationSeconds !== undefined && Number.isFinite(input.durationSeconds)) {
        lines.push(`${t.duration} : ${Math.max(0, Math.round(input.durationSeconds))} s`);
    }
    if (input.event !== "started") {
        lines.push(t.details);
    }
    return { title,
        body: lines.join("\n\n"),
        footer: `Dockge Enhanced${host ? ` · ${host}` : ""}` };
}
