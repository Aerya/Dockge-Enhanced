// Isolated real Vue/router/xterm test. No Docker or production connections.
import assert from "node:assert/strict";
import { createServer } from "vite";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({
    configFile: "frontend/vite.config.ts",
    server: { host: "127.0.0.1", port: 0, open: false },
    plugins: [{
        name: "shell-fixture",
        resolveId(id) { if (id === "/__shell.js") { return id; } },
        load(id) {
            if (id !== "/__shell.js") { return; }
            return `
import { createApp, h } from 'vue';
import { createRouter, createWebHashHistory, RouterView } from 'vue-router';
import Page from '/src/pages/ContainerTerminal.vue';
import Terminal from '/src/components/Terminal.vue';
window.calls = []; window.bound = []; window.errors = [];
const router = createRouter({history:createWebHashHistory(),routes:[
 {path:'/shell/:stackName/:serviceName/:type',name:'containerTerminal',component:Page},
 {path:'/shell/:stackName/:serviceName/:type/:endpoint',name:'containerTerminalEndpoint',component:Page}
]});
const app=createApp({
 methods: {
 bindTerminal(endpoint,name) {window.bound.push({endpoint,name});}, unbindTerminal() {},
 toastRes(res) {window.errors.push(res.msg);}, toastError() {},
 emitAgent(endpoint,event,...args) {
   window.calls.push({endpoint,event,args:args.slice(0,-1)});
   const cb=args.at(-1);
   if(event==='containerShellOptions') {
     if(endpoint==='old') return;
     cb({ok:true,defaultShell:'zsh'}); return;
   }
   if(event==='interactiveTerminalV2'||event==='interactiveTerminal') {
     const shell=args[2];
     setTimeout(()=>cb(shell==='fish'?{ok:false,msg:'unavailable'}:{ok:true,shell:shell==='default'?'sh':shell,fallback:shell==='default'}),30);
   } else if(typeof cb==='function') cb({ok:true});
 }
},render(){return h(RouterView);}});
app.config.globalProperties.$t=k=>k;
app.component('Terminal',Terminal); app.component('font-awesome-icon',{render:()=>null});
app.use(router); window.router=router; app.mount('#app');`;
        },
        configureServer(vite) {
            vite.middlewares.use((req,res,next)=>{
                if(req.url!=="/__shell") return next();
                res.setHeader("Content-Type","text/html");
                res.end('<div id="app"></div><script type="module" src="/__shell.js"></script>');
            });
        },
    }],
});
let browser;
try {
    await server.listen();
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
    const page=await browser.newPage();
    const failures=[];
    page.on("pageerror",error=>failures.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__shell#/shell/demo/app/default/remote`);
    await page.getByText("containerShell.fallback",{exact:false}).waitFor();
    assert.equal(await page.locator("select").inputValue(),"default");
    await page.locator("select").selectOption("bash");
    await page.waitForFunction(()=>window.bound.length===2);
    const bound=await page.evaluate(()=>window.bound);
    assert.notEqual(bound[0].name,bound[1].name);
    assert.equal(bound[1].endpoint,"remote");
    await page.locator("select").selectOption("fish");
    await page.waitForFunction(()=>window.errors.includes("unavailable"));
    assert.equal(await page.evaluate(()=>window.bound.length),2,"failed shell is never bound");
    await page.evaluate(()=>window.router.push({name:"containerTerminalEndpoint",params:{stackName:"demo",serviceName:"app",type:"default",endpoint:"old"}}));
    await page.getByText("containerShell.legacy").waitFor();
    await page.waitForFunction(()=>window.calls.some(c=>c.event==="interactiveTerminal"&&c.endpoint==="old"));
    const old=await page.evaluate(()=>window.calls.find(c=>c.event==="interactiveTerminal"&&c.endpoint==="old"));
    assert.equal(old.args[2],"bash");
    await page.getByText("Switch to sh").click();
    await page.waitForFunction(()=>window.calls.some(c=>c.event==="interactiveTerminal"&&c.args[2]==="sh"));
    assert.deepEqual(failures,[]);
    console.log("PASS real Vue/router/xterm: linked capability, fallback, independent shells, failure, legacy timeout and switch");
} finally {
    await browser?.close();
    await server.close();
}
