export interface RestoreTestCandidate {
    path: string;
    size: number;
}

/**
 * Choisit un fichier réel du snapshot pour vérifier que Restic sait le relire.
 * Un Compose non vide est préféré pour conserver le test historique, mais un
 * backup Dockge valide peut ne contenir aucun Compose : dans ce cas, n'importe
 * quel autre fichier non vide convient pour tester le chiffrement/déchiffrement.
 */
export function selectRestoreTestCandidate(lsOutput: string): RestoreTestCandidate | null {
    const files: RestoreTestCandidate[] = [];

    for (const line of lsOutput.split("\n").filter(Boolean)) {
        try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            if (obj.struct_type !== "node" || obj.type !== "file" || typeof obj.path !== "string") continue;
            const rawSize = Number(obj.size ?? 0);
            files.push({
                path: obj.path,
                size: Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : 0,
            });
        } catch { /* ignore non-node / malformed lines */ }
    }

    if (files.length === 0) return null;

    const isCompose = (candidate: RestoreTestCandidate) =>
        /^(compose|docker-compose)(\.ya?ml)?$/.test(candidate.path.split("/").pop() ?? "");

    return files.find(candidate => candidate.size > 0 && isCompose(candidate))
        ?? files.find(candidate => candidate.size > 0)
        ?? files.find(isCompose)
        ?? files[0];
}
