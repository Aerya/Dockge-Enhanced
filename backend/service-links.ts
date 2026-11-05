import { defaultServiceLinks, validateServiceLinks, type ServiceLinksConfig } from "../common/service-links";

export class ServiceLinksStore {
    private pending: Promise<unknown> = Promise.resolve();
    constructor(private read: () => Promise<unknown>, private write: (config: ServiceLinksConfig) => Promise<void>) {}
    async load(): Promise<ServiceLinksConfig> {
        const value = await this.read();
        return value == null ? defaultServiceLinks() : validateServiceLinks(value);
    }

    save(input: unknown): Promise<ServiceLinksConfig> {
        // Clone/validate now; a caller cannot change a queued operation.
        const config = validateServiceLinks(input);
        const save = async () => {
            const previous = await this.load();
            if (config.revision !== previous.revision) {
                throw new Error("serviceLinks.conflict");
            }
            const next = { ...config,
                revision: previous.revision + 1 };
            await this.write(next);
            return next;
        };
        const operation = this.pending.then(save);
        this.pending = operation.catch(() => {});
        return operation;
    }
}
