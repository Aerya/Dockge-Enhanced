import test from "node:test";
import assert from "node:assert/strict";
import { selectTrivyScanTarget } from "./trivy-scanner";

test("scans an untagged image through its local Docker hash", () => {
    assert.equal(
        selectTrivyScanTarget("63618bccfd9f", "ghcr.io/example/private-image:latest"),
        "63618bccfd9f"
    );
});

test("keeps a tagged image reference as the scan target", () => {
    assert.equal(
        selectTrivyScanTarget("ghcr.io/example/private-image:latest"),
        "ghcr.io/example/private-image:latest"
    );
});
