/**
 * Extension CodeMirror : coloration des variables d'environnement dans l'éditeur.
 *
 * - Surligne les références `${VAR}`, `${VAR:-default}` et `$VAR` dans le YAML.
 * - Distingue les variables définies (présentes dans .env / global.env) des
 *   variables non définies (soulignées en rouge), pour repérer rapidement les
 *   erreurs de configuration.
 *
 * La liste des variables définies est poussée dans l'éditeur via l'effet
 * `setDefinedVars` (voir Compose.vue).
 */
import {
    Decoration,
    type DecorationSet,
    EditorView,
    ViewPlugin,
    type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";

/** Effet pour mettre à jour la liste des variables définies. */
export const setDefinedVars = StateEffect.define<string[]>();

/** Champ d'état conservant l'ensemble des variables définies. */
const definedVarsField = StateField.define<Set<string>>({
    create: () => new Set(),
    update(value, tr) {
        for (const e of tr.effects) {
            if (e.is(setDefinedVars)) {
                return new Set(e.value);
            }
        }
        return value;
    },
});

// ${VAR}, ${VAR:-default}, ${VAR-default} ou $VAR
const VAR_RE = /\$\{?([A-Za-z_][A-Za-z0-9_]*)\b(?::?-[^}]*)?\}?/g;

const definedMark = Decoration.mark({ class: "cm-var-defined" });
const undefinedMark = Decoration.mark({ class: "cm-var-undefined" });

function buildDecorations(view: EditorView): DecorationSet {
    const defined = view.state.field(definedVarsField);
    const builder = new RangeSetBuilder<Decoration>();

    for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        let m: RegExpExecArray | null;
        VAR_RE.lastIndex = 0;
        while ((m = VAR_RE.exec(text)) !== null) {
            const start = from + m.index;
            const end = start + m[0].length;
            const name = m[1];
            builder.add(start, end, defined.has(name) ? definedMark : undefinedMark);
        }
    }

    return builder.finish();
}

const variableHighlightPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildDecorations(view);
        }

        update(update: ViewUpdate) {
            const definedVarsChanged = update.transactions.some((tr) =>
                tr.effects.some((e) => e.is(setDefinedVars))
            );
            if (update.docChanged || update.viewportChanged || definedVarsChanged) {
                this.decorations = buildDecorations(update.view);
            }
        }
    },
    {
        decorations: (v) => v.decorations,
    }
);

const variableHighlightTheme = EditorView.baseTheme({
    ".cm-var-defined": {
        color: "#79c0ff",
        fontWeight: "600",
    },
    ".cm-var-undefined": {
        color: "#ff7b72",
        fontWeight: "600",
        textDecoration: "underline wavy #ff7b72",
        textUnderlineOffset: "2px",
    },
});

/** Extension complète à ajouter à la liste `extensions` de CodeMirror. */
export const yamlVariableHighlight = [
    definedVarsField,
    variableHighlightPlugin,
    variableHighlightTheme,
];
