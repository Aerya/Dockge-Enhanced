import assert from "node:assert/strict";
import test from "node:test";
import { parseEnvForm, editEnvValue } from "./env-form";

test("environment form keeps comments, CRLF, quotes, interpolation and duplicate keys unchanged", () => {
    const text = "# comment\r\nexport A =\"${OTHER:-value}\" # note\r\nA=second\r\nINVALID LINE\r\n";
    assert.equal(parseEnvForm(text).map(line => line.raw + line.ending).join(""), text);
    assert.equal(editEnvValue(text, 2, "changed"), text.replace("A=second", "A=changed"));
    assert.throws(() => editEnvValue(text, 0, "value"));
    assert.throws(() => editEnvValue(text, 2, "value\nINJECT=1"));
});

test("multiline quoted values are not editable as independent variables", () => {
    const text = "MULTI='first\nNOT_A_KEY=value\nlast'\nNORMAL=yes";
    const lines = parseEnvForm(text);
    assert.deepEqual(lines.map(line => line.key), [ undefined, undefined, undefined, "NORMAL" ]);
    assert.equal(editEnvValue(text, 3, "no"), text.replace("NORMAL=yes", "NORMAL=no"));
});

test("escaped quotes do not expose multiline content as editable variables", () => {
    const text = "MULTI=\"first\\\"\nNOT_A_KEY=value\nlast\"\nNORMAL=yes";
    assert.deepEqual(parseEnvForm(text).map(line => line.key), [ undefined, undefined, undefined, "NORMAL" ]);
    assert.throws(() => editEnvValue(text, 1, "changed"));
});
