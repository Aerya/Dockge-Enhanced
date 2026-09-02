import assert from "node:assert/strict";
import test from "node:test";
import { selectRestoreTestCandidate } from "./backup-restore-test";

const node = (path: string, size: number) => JSON.stringify({
    struct_type: "node",
    type: "file",
    path,
    size,
});

test("préfère un compose non vide", () => {
    const result = selectRestoreTestCandidate([
        node("/opt/dockge/data/settings.json", 120),
        node("/opt/stacks/app/compose.yaml", 80),
    ].join("\n"));
    assert.deepEqual(result, { path: "/opt/stacks/app/compose.yaml", size: 80 });
});

test("utilise un fichier Dockge si aucun compose n'est présent", () => {
    const result = selectRestoreTestCandidate([
        node("/opt/dockge/data/backup-settings.json", 240),
        node("/opt/dockge/data/backup-history.json", 120),
    ].join("\n"));
    assert.deepEqual(result, { path: "/opt/dockge/data/backup-settings.json", size: 240 });
});

test("ignore les lignes non JSON et les répertoires", () => {
    const result = selectRestoreTestCandidate([
        "snapshot 123",
        JSON.stringify({ struct_type: "node", type: "dir", path: "/opt/dockge/data" }),
        node("/opt/dockge/data/settings.json", 42),
    ].join("\n"));
    assert.deepEqual(result, { path: "/opt/dockge/data/settings.json", size: 42 });
});

test("ne choisit un fichier vide que si aucun fichier non vide n'existe", () => {
    const result = selectRestoreTestCandidate([
        node("/opt/stacks/app/compose.yaml", 0),
        node("/opt/dockge/data/settings.json", 12),
    ].join("\n"));
    assert.deepEqual(result, { path: "/opt/dockge/data/settings.json", size: 12 });
});

test("retourne null pour un snapshot sans fichier", () => {
    assert.equal(selectRestoreTestCandidate(""), null);
});
