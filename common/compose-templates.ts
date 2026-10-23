export const DEFAULT_COMPOSE_ENV = "# VARIABLE=value #comment";
export const MAX_COMPOSE_TEMPLATE_BYTES = 65536;

/** Apply settings only to untouched fields; an imported draft always takes precedence. */
export function applyComposeTemplates(
    draft: { composeYAML: string;
        composeENV: string },
    initial: { composeYAML: string;
        composeENV: string },
    settings: { composeTemplate?: unknown;
        composeEnvTemplate?: unknown },
    useCompose: boolean,
    useEnv: boolean,
): void {
    if (useCompose && draft.composeYAML === initial.composeYAML && typeof settings.composeTemplate === "string" && settings.composeTemplate) {
        draft.composeYAML = settings.composeTemplate;
    }
    if (useEnv && draft.composeENV === initial.composeENV && typeof settings.composeEnvTemplate === "string") {
        draft.composeENV = settings.composeEnvTemplate;
    }
}
