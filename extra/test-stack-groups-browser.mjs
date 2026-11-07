// Real Vue component, isolated in-memory server double: no Docker or production data.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium node extra/test-stack-groups-browser.mjs
import assert from "node:assert/strict";
import { createServer } from "vite";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({
    configFile: "frontend/vite.config.ts",
    server: { host: "127.0.0.1", port: 0, open: false },
    plugins: [{
        name: "isolated-groups-fixture",
        resolveId(id) { if (id === "/__groups.js") return id; },
        load(id) {
            if (id !== "/__groups.js") return;
            return `
import {createApp,h} from 'vue';
import Groups from '/src/components/StackGroups.vue';
import messages from '/src/lang/fr.json';
let config={revision:0,preferences:{enabled:false,groups:[]}};
const socket={connected:true,on(){},off(){},timeout(){return this},emit(event,...args){
 const cb=args.at(-1);
 if(event==='stackGroups:save') {config={revision:config.revision+1,preferences:structuredClone(args[0].preferences)};}
 cb(null,{ok:true,config:structuredClone(config)});
}};
const stacks=[{name:'local-demo',status:1},{name:'remote-demo',endpoint:'agent.example',status:1}];
const app=createApp({
 data:()=>({searching:false,revision:0}),
 methods:{getSocket(){return socket}},
 render(){return h(Groups,{key:this.revision,ref:'groups',username:'isolated',stacks,availableStacks:stacks,searching:this.searching,endpointLabel:v=>v||'local'},{
 stack:({stack})=>h('div',{'data-stack':stack.name},stack.name)
 })}
});
app.config.globalProperties.$t=key=>messages[key]||key;
window.fixture=app.mount('#app');`;
        },
        configureServer(vite) {
            vite.middlewares.use((req,res,next)=>{
                if(req.url!=="/__groups") return next();
                res.setHeader("Content-Type","text/html");
                res.end('<div id="app"></div><script type="module" src="/__groups.js"></script>');
            });
        },
    }],
});
let browser;
try {
    await server.listen();
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
    for(const width of [390,1280]){
        const page=await browser.newPage({viewport:{width,height:900}});
        const errors=[];
        page.on("pageerror",error=>errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__groups`);
        await page.waitForFunction(()=>window.fixture?.$refs.groups?.ready);
        await page.getByRole("button",{name:"Gérer",exact:true}).click();
        for(const name of ["Production","Media"]){
            await page.locator("form input").fill(name);
            await page.locator("form button").click();
            await page.waitForFunction(()=>!window.fixture.$refs.groups.busy);
        }
        const parent=await page.evaluate(()=>window.fixture.$refs.groups.preferences.groups[0].id);
        const child=await page.evaluate(()=>window.fixture.$refs.groups.preferences.groups[1].id);
        await page.locator(".group-edit-row select").nth(1).selectOption(parent);
        await page.locator(".group-assignments select").nth(0).selectOption(child);
        await page.locator(".group-assignments select").nth(1).selectOption(child);
        assert.equal(await page.locator(".custom-stack-group").count(),2);
        assert.equal(await page.locator(".group-edit-row select").nth(0).locator("option").count(),1);
        await page.locator("button.group-heading").first().click();
        assert.equal(await page.locator(".custom-stack-group").count(),1);
        assert.equal(await page.locator("[data-stack]").count(),0);
        await page.evaluate(()=>window.fixture.searching=true);
        await page.waitForSelector('[data-stack="remote-demo"]');
        assert.equal(await page.locator(".custom-stack-group").count(),2);
        await page.evaluate(()=>{window.fixture.searching=false;window.fixture.revision++;});
        await page.waitForFunction(()=>window.fixture.$refs.groups.ready);
        assert.equal(await page.locator(".custom-stack-group").count(),1);
        await page.getByRole("button",{name:"Gérer",exact:true}).click();
        await page.locator(".group-edit-row button").first().click();
        await page.waitForSelector('[data-stack="remote-demo"]');
        assert.equal(await page.locator("[data-stack]").count(),2);
        assert.equal(await page.locator(".group-edit-row").count(),1);
        assert.deepEqual(errors,[]);
        console.log(`PASS ${width}px: create, parent, linked assignment, collapse, search, reload, delete parent`);
        await page.close();
    }
} finally {
    await browser?.close();
    await server.close();
}
