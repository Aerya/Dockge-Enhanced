import { i18n } from "./i18n";
import { localizeServerResponse } from "./server-message";

export function localizeApiResponse<T>(response: T): T {
    return localizeServerResponse(response, (key, values) => i18n.global.te(key) || i18n.global.te(key, "en") ? i18n.global.t(key, values || {}) : key);
}
