import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";
import jsdoc from "eslint-plugin-jsdoc";
import vuePlugin from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";

const sourceFiles = [ "**/*.{ts,vue}" ];

const customRules = {
    yoda: "error",
    "@stylistic/linebreak-style": [ "error", "unix" ],
    camelcase: [ "warn", {
        properties: "never",
        ignoreImports: true,
    } ],
    "no-unused-vars": [ "warn", {
        args: "none",
    } ],
    "@stylistic/indent": [
        "error",
        4,
        {
            ignoredNodes: [ "TemplateLiteral" ],
            SwitchCase: 1,
        },
    ],
    "@stylistic/quotes": [ "error", "double" ],
    "@stylistic/semi": "error",
    "vue/html-indent": [ "error", 4 ],
    "vue/max-attributes-per-line": "off",
    "vue/singleline-html-element-content-newline": "off",
    "vue/html-self-closing": "off",
    "vue/require-component-is": "off",
    "vue/attribute-hyphenation": "off",
    "vue/multi-word-component-names": "off",
    "@stylistic/no-multi-spaces": [ "error", {
        ignoreEOLComments: true,
    } ],
    "@stylistic/array-bracket-spacing": [ "warn", "always", {
        singleValue: true,
        objectsInArrays: false,
        arraysInArrays: false,
    } ],
    "@stylistic/space-before-function-paren": [ "error", {
        anonymous: "always",
        named: "never",
        asyncArrow: "always",
    } ],
    curly: "error",
    "@stylistic/object-curly-spacing": [ "error", "always" ],
    "@stylistic/object-curly-newline": "off",
    "@stylistic/object-property-newline": "error",
    "@stylistic/comma-spacing": "error",
    "@stylistic/brace-style": "error",
    "no-var": "error",
    "@stylistic/key-spacing": "warn",
    "@stylistic/keyword-spacing": "warn",
    "@stylistic/space-infix-ops": "error",
    "@stylistic/arrow-spacing": "warn",
    "@stylistic/no-trailing-spaces": "error",
    "no-constant-condition": [ "error", {
        checkLoops: false,
    } ],
    "@stylistic/space-before-blocks": "warn",
    "no-extra-boolean-cast": "off",
    "@stylistic/no-multiple-empty-lines": [ "warn", {
        max: 1,
        maxBOF: 0,
    } ],
    "@stylistic/lines-between-class-members": [ "warn", "always", {
        exceptAfterSingleLine: true,
    } ],
    "no-unneeded-ternary": "error",
    "@stylistic/array-bracket-newline": [ "error", "consistent" ],
    "@stylistic/eol-last": [ "error", "always" ],
    "@stylistic/comma-dangle": [ "warn", "only-multiline" ],
    "no-empty": [ "error", {
        allowEmptyCatch: true,
    } ],
    "no-control-regex": "off",
    "one-var": [ "error", "never" ],
    "@stylistic/max-statements-per-line": [ "error", { max: 1 } ],
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-unused-vars": [ "warn", {
        args: "none",
    } ],
    "prefer-const": "off",
};

export default [
    {
        ignores: [
            "**/node_modules/**",
            "frontend-dist/**",
        ],
    },
    {
        ...js.configs.recommended,
        files: sourceFiles,
    },
    ...tsPlugin.configs["flat/recommended"],
    ...vuePlugin.configs["flat/recommended"],
    {
        files: sourceFiles,
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        plugins: {
            "@stylistic": stylistic,
            jsdoc,
        },
        rules: customRules,
    },
    {
        files: [ "**/*.ts" ],
        languageOptions: {
            parser: tsParser,
        },
    },
    {
        files: [ "**/*.vue" ],
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                parser: tsParser,
            },
        },
    },
];
