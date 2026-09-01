export const RELEASE_NEWS = [
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
];

export function getReleaseNewsSince(lastSeenId) {
    if (RELEASE_NEWS.length === 0) {
        return [];
    }

    const lastSeenIndex = RELEASE_NEWS.findIndex((release) => release.id === lastSeenId);
    const releases = lastSeenIndex >= 0
        ? RELEASE_NEWS.slice(lastSeenIndex + 1)
        : RELEASE_NEWS.slice(-1);

    return releases.flatMap((release) => release.items);
}

export function getLatestReleaseNewsId() {
    return RELEASE_NEWS.at(-1)?.id ?? "";
}
