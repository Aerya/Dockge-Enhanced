export interface RestoreTestCandidate {
    path: string;
    size: number;
}

export class RestoreTestCandidateSelector {
    private firstFile: RestoreTestCandidate | null = null;
    private firstNonEmpty: RestoreTestCandidate | null = null;
    private firstCompose: RestoreTestCandidate | null = null;
    private firstNonEmptyCompose: RestoreTestCandidate | null = null;

    addLine(line: string): void {
        if (!line) return;

        try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            if (obj.struct_type !== "node" || obj.type !== "file" || typeof obj.path !== "string") return;

            const rawSize = Number(obj.size ?? 0);
            const candidate = {
                path: obj.path,
                size: Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : 0,
            };
            const isCompose = /^(compose|docker-compose)(\.ya?ml)?$/.test(candidate.path.split("/").pop() ?? "");

            this.firstFile ??= candidate;
            if (candidate.size > 0) this.firstNonEmpty ??= candidate;
            if (isCompose) this.firstCompose ??= candidate;
            if (candidate.size > 0 && isCompose) this.firstNonEmptyCompose ??= candidate;
        } catch { /* ignore non-node / malformed lines */ }
    }

    getCandidate(): RestoreTestCandidate | null {
        return this.firstNonEmptyCompose
            ?? this.firstNonEmpty
            ?? this.firstCompose
            ?? this.firstFile;
    }
}

/**
 * Choisit un fichier réel du snapshot pour vérifier que Restic sait le relire.
 * Un Compose non vide est préféré pour conserver le test historique, mais un
 * backup Dockge valide peut ne contenir aucun Compose : dans ce cas, n'importe
 * quel autre fichier non vide convient pour tester le chiffrement/déchiffrement.
 */
export function selectRestoreTestCandidate(lsOutput: string | string[]): RestoreTestCandidate | null {
    const selector = new RestoreTestCandidateSelector();
    const lines = Array.isArray(lsOutput) ? lsOutput : lsOutput.split("\n");
    for (const line of lines) selector.addLine(line);
    return selector.getCandidate();
}
