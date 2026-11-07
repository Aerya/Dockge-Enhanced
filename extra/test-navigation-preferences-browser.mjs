import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse as parseSFC } from "@vue/compiler-sfc";
import { parse } from "@vue/compiler-dom";
import { createServer } from "vite";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const links=[];
function visit(nodes) {
    for(const node of nodes) {
        if(node.type!==1)continue;
        if(node.tag==="li" && node.children.some(child=>child.type===1&&child.tag==="router-link"
            && child.props.some(p=>p.type===6&&p.name==="to"&&["/","/watcher","/apps","/files","/console","/service-links","/topology","/external-stacks"].includes(p.value?.content)))) {
            links.push(node.loc.source);
            continue;
        }
        const to=node.props.find(p=>p.type===6&&p.name==="to")?.value?.content;
        if(node.tag==="router-link"&&["/","/watcher","/apps","/files","/console","/service-links","/topology","/external-stacks"].includes(to))links.push(node.loc.source);
        visit(node.children);
    }
}
visit(parse(parseSFC(readFileSync("frontend/src/layouts/Layout.vue","utf8")).descriptor.template.content).children);
const server=await createServer({configFile:"frontend/vite.config.ts",server:{host:"127.0.0.1",port:0,open:false},plugins:[{
    name:"navigation-preferences-fixture",
    resolveId(id){if(id==="/__navigation.js")return id;},
    load(id){
        if(id!=="/__navigation.js")return;
        return `import {createApp,h} from 'vue';import {compile} from 'vue/dist/vue.esm-bundler.js';import Preferences from '/src/mixins/ui-preferences.js';import Appearance from '/src/components/settings/Appearance.vue';import 'bootstrap/dist/css/bootstrap.min.css';
const socket={on(){},off(){},timeout(){return this},emit(event,...args){const cb=args.pop();setTimeout(()=>{const key='fixture-preferences';let config=JSON.parse(localStorage.getItem(key)||'null')||{revision:0,preferences:{hiddenNavigation:[],disabledCatalogSources:[]}};if(event==='uiPreferences:save'){config={revision:config.revision+1,preferences:args[0].preferences};localStorage.setItem(key,JSON.stringify(config));}cb(null,{ok:true,config});},5)}};
const Links={render:compile(${JSON.stringify('<nav>'+links.join('')+'</nav>')})};
const app=createApp({mixins:[Preferences],data:()=>({loggedIn:true,username:'alice',userAccess:{role:'admin'},hideConsoleNavigation:false,compactInterface:false,language:'en',userTheme:'dark',dayPalette:'default',nightPalette:'default'}),methods:{getSocket:()=>socket,toastError:message=>{throw Error(message)}},render(){return h('div',[h(Appearance),h(Links)])}});
app.config.globalProperties.$t=k=>k;app.config.globalProperties.$i18n={availableLocales:['en'],messages:{en:{languageName:'English'}}};app.component('RouterLink',{props:['to'],setup:(p,{slots})=>()=>h('a',{href:p.to},slots.default?.())});app.component('FontAwesomeIcon',{render:()=>null});app.mount('#app');`;
    },
    configureServer(vite){vite.middlewares.use((req,res,next)=>{if(req.url!=="/__navigation")return next();res.setHeader("Content-Type","text/html");res.end('<div id="app"></div><script type="module" src="/__navigation.js"></script>')});}
}]});
let browser;
try {
    await server.listen();
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
    for(const width of [390,1280]){
        const context=await browser.newContext({viewport:{width,height:900}});
        const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__navigation`);
        await page.locator("#navigation-files").uncheck();
        await page.waitForFunction(()=>!document.querySelector('a[href="/files"]'));
        assert.ok(await page.locator('a[href="/"]').count());
        assert.ok(await page.locator('a[href="/watcher"]').count());
        await page.reload();
        await page.waitForFunction(()=>!document.querySelector('a[href="/files"]'));
        assert.equal(await page.locator("#navigation-files").isChecked(),false);
        await page.locator("#navigation-files").check();
        await page.waitForFunction(()=>document.querySelector('a[href="/files"]'));
        for(const id of ["services","apps","topology","console","external","search"]){await page.locator("#navigation-"+id).uncheck();await page.waitForTimeout(20);}
        assert.ok(await page.locator('a[href="/"]').count());
        assert.ok(await page.locator('a[href="/watcher"]').count());
        assert.equal(await page.locator("#navigation-home").count(),0);
        assert.equal(await page.locator("#navigation-enhanced").count(),0);
        assert.deepEqual(errors,[]);
        console.log(`PASS ${width}px: actual appearance controls, desktop/mobile links, saved reload, Home and Enhanced fixed`);
        await context.close();
    }
}finally{await browser?.close();await server.close();}
