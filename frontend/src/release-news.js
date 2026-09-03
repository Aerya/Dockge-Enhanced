export const RELEASE_NEWS = [
    {
        id: "2026-09-03-linked-instance-stack-stats",
        items: [ "releaseNews.item.linkedInstanceStackStats" ],
    },
    {
        id: "2026-09-03-server-persisted-stack-pins",
        items: [ "releaseNews.item.serverPersistedStackPins" ],
    },
    {
        id: "2026-09-03-self-update-backup-retention",
        items: [ "releaseNews.item.selfUpdateBackupRetention" ],
    },
    {
        id: "2026-09-03-instance-identity",
        items: [ "releaseNews.item.instanceIdentity" ],
    },
    {
        id: "2026-09-02-self-update-operation-guard",
        items: [ "releaseNews.item.selfUpdateOperationGuard" ],
    },
    {
        id: "2026-09-02-linked-instance-transfer-compatibility",
        items: [ "releaseNews.item.transferCompatibility" ],
    },
    {
        id: "2026-08-06-agent-federation-migration-links",
        items: [
            "releaseNews.item.agentMesh",
            "releaseNews.item.remoteLinks",
            "releaseNews.item.dozzle",
            "releaseNews.item.logs",
            "releaseNews.item.actions",
            "releaseNews.item.scheduling",
        ],
    },
    {
        id: "2026-08-09-update-range-log-wrap",
        items: [
            "releaseNews.item.updateRange",
            "releaseNews.item.logWrap",
        ],
    },
    {
        id: "2026-08-09-compose-workspace-pins",
        items: [
            "releaseNews.item.stackPins",
            "releaseNews.item.composeWorkspace",
            "releaseNews.item.rawComposeCopy",
        ],
    },
    {
        id: "2026-08-11-resizable-stack-sidebar",
        items: [
            "releaseNews.item.stackSidebar",
        ],
    },
    {
        id: "2026-08-17-live-stack-logs-refresh",
        items: [
            "releaseNews.item.liveStackLogsRefresh",
        ],
    },
    {
        id: "2026-08-18-log-nowrap-scrollbar",
        items: [
            "releaseNews.item.logNoWrapScrollbar",
        ],
    },
    {
        id: "2026-08-18-log-follow-toggle",
        items: [
            "releaseNews.item.logFollowToggle",
        ],
    },
    {
        id: "2026-08-19-stack-date-sorting",
        items: [
            "releaseNews.item.stackDateSorting",
        ],
    },
    {
        id: "2026-08-20-stack-transfer-errors-data",
        items: [
            "releaseNews.item.stackTransferErrors",
            "releaseNews.item.stackTransferData",
        ],
    },
    {
        id: "2026-08-20-stack-transfer-registry-access",
        items: [
            "releaseNews.item.stackTransferRegistryAccess",
        ],
    },
    {
        id: "2026-08-20-stack-transfer-images",
        items: [
            "releaseNews.item.stackTransferImages",
        ],
    },
    {
        id: "2026-08-22-federation-token-rotation",
        items: [
            "releaseNews.item.federationTokens",
        ],
    },
    {
        id: "2026-08-27-stack-start-guard",
        items: [
            "releaseNews.item.startGuard",
        ],
    },
    {
        id: "2026-08-27-stack-start-guard-watch",
        items: [
            "releaseNews.item.startGuardWatch",
        ],
    },
    {
        id: "2026-08-30-crossly-ui-integration",
        items: [
            "releaseNews.item.crosslyUiIntegration",
        ],
    },
    {
        id: "2026-08-31-safe-self-updates",
        items: [
            "releaseNews.item.safeSelfUpdates",
        ],
    },
    {
        id: "2026-08-31-self-update-hardening",
        items: [
            "releaseNews.item.selfUpdateHardening",
        ],
    },
    {
        id: "2026-09-01-remote-update-badges",
        items: [
            "releaseNews.item.remoteUpdateBadges",
        ],
    },
    {
        id: "2026-09-01-four-language-enhanced",
        items: [
            "releaseNews.item.fourLanguageEnhanced",
        ],
    },
    {
        id: "2026-09-01-self-update-tracking",
        items: [
            "releaseNews.item.selfUpdateTracking",
        ],
    },
    {
        id: "2026-09-02-stack-path-traversal-hardening",
        items: [
            "releaseNews.item.stackPathTraversal",
        ],
    },
    {
        id: "2026-09-02-preserve-tmpfs-octal-mode",
        items: [
            "releaseNews.item.tmpfsOctalMode",
        ],
    },
    {
        id: "2026-09-02-compose-long-port-syntax-v2",
        items: [
            "releaseNews.item.composeLongPorts",
        ],
    },
    {
        id: "2026-09-02-compose-project-name-reconciliation",
        items: [
            "releaseNews.item.composeProjectNames",
        ],
    },
    {
        id: "2026-09-02-remote-announcements",
        items: [
            "releaseNews.item.remoteAnnouncements",
        ],
    },
    {
        id: "2026-09-02-cumulative-release-news",
        items: [
            "releaseNews.item.cumulativeReleaseNews",
        ],
    },
];

function currentReleaseNewsIds() {
    return new Set(RELEASE_NEWS.map((release) => release.id));
}

export function sanitizeSeenReleaseNewsIds(value) {
    if (!Array.isArray(value)) return [];
    const currentIds = currentReleaseNewsIds();
    return [ ...new Set(value.filter((id) => typeof id === "string" && currentIds.has(id))) ];
}

export function getInitialSeenReleaseNewsIds(legacyLastSeenId) {
    if (RELEASE_NEWS.length === 0) return [];

    if (typeof legacyLastSeenId === "string" && legacyLastSeenId) {
        const index = RELEASE_NEWS.findIndex((release) => release.id === legacyLastSeenId);
        if (index >= 0) {
            return RELEASE_NEWS.slice(0, index + 1).map((release) => release.id);
        }
    }

    // Préserve le comportement historique au premier passage : seule la
    // nouveauté courante reste non lue, sans rejouer tout l'historique.
    return RELEASE_NEWS.slice(0, -1).map((release) => release.id);
}

export function getUnreadReleaseNews(seenIds) {
    const seen = new Set(sanitizeSeenReleaseNewsIds(seenIds));
    return RELEASE_NEWS.filter((release) => !seen.has(release.id));
}
