import test from "node:test";
import assert from "node:assert/strict";
import { parseOidcRedirect } from "./oidc-redirect";

test("lit le code OIDC ou la clé d’erreur dans le fragment", () => {
    assert.deepEqual(parseOidcRedirect("#oidc=AbCdEfGhIjKlMnOpQrSt_-12"), { code: "AbCdEfGhIjKlMnOpQrSt_-12" });
    assert.deepEqual(parseOidcRedirect("#oidcError=oidc.expired"), { error: "oidc.expired" });
    assert.equal(parseOidcRedirect(""), null);
    assert.equal(parseOidcRedirect("#oidc=short"), null);
    assert.equal(parseOidcRedirect("#oidcError=<script>"), null);
});
