import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { compile, createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import { parse, type TemplateChildNode } from "@vue/compiler-dom";
import { parse as parseSFC } from "@vue/compiler-sfc";
import { loadHiddenConsole, saveHiddenConsole } from "./console-navigation";

test("console visibility is applied to the actual desktop and mobile templates", async () => {
    const source = readFileSync(new URL("./layouts/Layout.vue", import.meta.url), "utf8");
    const templates: string[] = [];
    const visit = (children: TemplateChildNode[]) => {
        for (const node of children) {
            if (node.type !== 1) {
                continue;
            }
            if ((node.tag === "li" && node.loc.source.includes("to=\"/console\"")) ||
                (node.tag === "router-link" && node.loc.source.includes("to=\"/console\"") && node.loc.source.includes("mobile-drawer-link"))) {
                templates.push(node.loc.source);
            }
            visit(node.children);
        }
    };
    visit(parse(parseSFC(source).descriptor.template!.content).children);
    assert.equal(templates.length, 2);
    for (const template of templates) {
        for (const loggedIn of [ false, true ]) {
            for (const hideConsoleNavigation of [ false, true ]) {
                for (const role of [ "admin", "restricted" ]) {
                    const app = createSSRApp({
                        data: () => ({ loggedIn,
                            hideConsoleNavigation,
                            userAccess: { role } }),
                        render: compile(template),
                    });
                    app.config.globalProperties.$t = (key: string) => key;
                    app.component("RouterLink", {
                        props: [ "to" ],
                        setup: (props, { slots }) => () => h("a", { href: props.to }, slots.default?.()),
                    });
                    app.component("FontAwesomeIcon", { render: () => null });
                    const html = await renderToString(app);
                    assert.equal(html.includes("href=\"/console\""), loggedIn && !hideConsoleNavigation && role === "admin");
                }
            }
        }
    }
});

test("preference defaults to visible and stays isolated per account", () => {
    const values = new Map<string, string>();
    const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
    };
    assert.equal(loadHiddenConsole(storage, "alice"), false);
    saveHiddenConsole(storage, "alice", true);
    assert.equal(loadHiddenConsole(storage, "alice"), true);
    assert.equal(loadHiddenConsole(storage, "bob"), false);
    assert.equal(loadHiddenConsole(storage, null), false);
    saveHiddenConsole(storage, null, true);
    assert.equal(values.size, 1);
    saveHiddenConsole(storage, "alice", false);
    assert.equal(loadHiddenConsole(storage, "alice"), false);
});

test("blocked storage leaves navigation usable", () => {
    const storage = {
        getItem: () => {
            throw new Error("blocked");
        },
        setItem: () => {
            throw new Error("blocked");
        },
    };
    assert.equal(loadHiddenConsole(storage, "alice"), false);
    assert.doesNotThrow(() => saveHiddenConsole(storage, "alice", true));
});
