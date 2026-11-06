import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { compile, createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import { parse as parseTemplate, type ElementNode, type TemplateChildNode } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import { loadCompactInterface, saveCompactInterface } from "./interface-density";

test("desktop and mobile navigation put Home first without exposing the layout switch", async () => {
    const source = readFileSync(new URL("./layouts/Layout.vue", import.meta.url), "utf8");
    const nodes: ElementNode[] = [];
    const visit = (children: TemplateChildNode[]) => {
        for (const node of children) {
            if (node.type === 1) {
                nodes.push(node);
                visit(node.children);
            }
        }
    };
    visit(parseTemplate(parse(source).descriptor.template!.content).children);
    const fragments = [ "desktop-nav nav nav-pills", "mobile-drawer-nav" ].map(className => {
        const nav = nodes.find(node => node.props.some(prop => prop.type === 6 && prop.name === "class" && prop.value?.content === className));
        assert.ok(nav);
        assert.ok(!nav.loc.source.includes("compactInterface"));
        // Render the actual primary links and their visibility guards, without the profile dropdown.
        return "<div>" + nav.children.filter(node => node.type === 1 && (node.tag === "router-link" || node.children.some(child => child.type === 1 && child.tag === "router-link"))).map(node => node.loc.source).join("") + "</div>";
    });
    for (const template of fragments) {
        assert.ok(template);
        for (const role of [ "admin", "restricted" ]) {
            for (const compactInterface of [ false, true ]) {
                const app = createSSRApp({
                    data: () => ({ loggedIn: true,
                        userAccess: { role },
                        compactInterface }),
                    render: compile(template),
                });
                app.config.globalProperties.$t = (key: string) => key;
                app.component("RouterLink", {
                    props: [ "to" ],
                    setup: (props, { slots }) => () => h("a", { href: props.to }, slots.default?.()),
                });
                app.component("FontAwesomeIcon", { render: () => null });
                const html = await renderToString(app);
                const links = [ ...html.matchAll(/href="([^"]+)"/g) ].map(match => match[1]);
                assert.equal(links[0], "/");
                if (role === "admin") {
                    assert.equal(links[1], "/service-links");
                } else {
                    assert.ok(!links.includes("/service-links"));
                }
                assert.ok(!html.includes("interfaceDensity."));
                assert.ok(!html.includes("density-switch"));
            }
        }
    }
});

test("Appearance keeps both layout choices and updates the existing preference", async () => {
    const source = readFileSync(new URL("./components/settings/Appearance.vue", import.meta.url), "utf8");
    const template = source.match(/<select id="interface-density"[\s\S]*?<\/select>/)?.[0];
    assert.ok(template);
    for (const compactInterface of [ false, true ]) {
        const root = { compactInterface };
        const render = compile(template);
        let update: ((value: boolean) => void) | undefined;
        const app = createSSRApp({
            render() {
                const vnode = render({ $root: root,
                    $t: (key: string) => key }, []);
                update = vnode.props!["onUpdate:modelValue"];
                return vnode;
            },
        });
        const html = await renderToString(app);
        assert.ok(html.includes("interfaceDensity.classic"));
        assert.ok(html.includes("interfaceDensity.compact"));
        assert.ok(update);
        update(!compactInterface);
        assert.equal(root.compactInterface, !compactInterface);
    }
});

test("classic is the default; compact is persisted per account and reversible", () => {
    const values = new Map<string, string>();
    const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
    };
    assert.equal(loadCompactInterface(storage, "alice"), false);
    saveCompactInterface(storage, "alice", true);
    assert.equal(loadCompactInterface(storage, "alice"), true);
    assert.equal(loadCompactInterface(storage, "bob"), false);
    assert.equal(loadCompactInterface(storage, null), false);
    saveCompactInterface(storage, null, true);
    assert.equal(values.size, 1);
    saveCompactInterface(storage, "alice", false);
    assert.equal(loadCompactInterface(storage, "alice"), false);
    values.set("interface-density:alice", "unexpected");
    assert.equal(loadCompactInterface(storage, "alice"), false);
});

test("unavailable storage does not break the interface", () => {
    const storage = {
        getItem: () => {
            throw new Error("Storage blocked");
        },
        setItem: () => {
            throw new Error("Storage blocked");
        },
    };
    assert.equal(loadCompactInterface(storage, "alice"), false);
    assert.doesNotThrow(() => saveCompactInterface(storage, "alice", true));
});
