import assert from "node:assert/strict";
import { createServer } from "vite";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({ configFile: "frontend/vite.config.ts", server: { host: "127.0.0.1", port: 0, open: false }, plugins: [{
    name: "catalog-fixture",
    resolveId(id) { if (id === "/__catalog.js") return id; },
    load(id) {
        if (id !== "/__catalog.js") return;
        return `import {createApp,h} from 'vue';import Catalog from '/src/pages/AppCatalog.vue';import 'bootstrap/dist/css/bootstrap.min.css';
window.calls=[];window.xss=false;
const app=createApp({data:()=>({composeTemplate:'',envTemplate:''}),methods:{emitAgent(endpoint,event,input,cb){window.calls.push({endpoint,event,input});cb({ok:true,data:event==='appCatalogSources'?[{id:'lissy93',name:'Lissy93',repo:'Lissy93/portainer-templates',file:'main/templates.json',format:'portainer'},{id:'second',name:'Second source',repo:'example/catalog',file:'main/templates.json',format:'portainer'}]:event==='appCatalogList'?{source:input.source,revision:'revision',fetchedAt:Date.now(),items:[{index:0,title:'Demo',categories:['Test'],website:'https://example.org/app',origin:'https://github.com/example/app',description:'<img src=x onerror=window.xss=true>',note:'<script>window.xss=true<\\/script>',supported:true},{index:1,title:'Swarm',categories:['Other'],supported:false}]}:{origin:'https://raw.githubusercontent.com/demo/catalog/main/app.yaml',digest:'abc',compose:'services:\\n  app:\\n    image: busybox:stable',fields:[{name:'TOKEN',label:'Token',value:'value'}],warnings:['appCatalog.mounts']}})}},render(){return h(Catalog)}});app.config.globalProperties.$t=k=>k;app.config.globalProperties.$router={push(path){window.result={path,compose:app._instance.data.composeTemplate,env:app._instance.data.envTemplate}}};app.mount('#app');`;
    },
    configureServer(vite) { vite.middlewares.use((req,res,next)=>{if(req.url!=="/__catalog")return next();res.setHeader("Content-Type","text/html");res.end('<div id="app"></div><script type="module" src="/__catalog.js"></script>')}); },
}] });
let browser;
try {
    await server.listen();
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
    for(const width of [390,1280]) {
        const page=await browser.newPage({viewport:{width,height:900}});
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__catalog`);
        await page.getByRole('button',{name:'appCatalog.load',exact:true}).click();
        await page.getByRole('combobox').selectOption('second');
        await page.getByRole('button',{name:'appCatalog.load',exact:true}).click();
        await page.getByRole('combobox').selectOption('all');
        assert.equal(await page.locator('article').count(),4);
        await page.getByRole('button',{name:'test',exact:true}).click();
        assert.equal(await page.locator('article').count(),2);
        assert.equal(await page.locator('article a').first().getAttribute('href'),'https://example.org/app');
        await page.getByRole('button',{name:'appCatalog.details',exact:true}).first().click();
        await page.getByLabel('appCatalog.chooseSource').selectOption('second:0');
        await page.getByRole('button',{name:'appCatalog.prepare',exact:true}).click();
        await page.getByText('appCatalog.mounts',{exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'appCatalog.edit'}).isDisabled(),true);
        await page.getByLabel('Token (TOKEN)').fill('edited');
        await page.getByRole('checkbox').check();
        await page.getByRole('button',{name:'appCatalog.edit'}).click();
        const result=await page.evaluate(()=>window.result);
        assert.equal(result.path,'/compose');assert.match(result.env,/TOKEN='edited'/);assert.match(result.compose,/busybox/);
        assert.equal(await page.evaluate(()=>window.xss),false);
        assert.deepEqual(errors,[]);
        assert.deepEqual(await page.evaluate(()=>window.calls.map(c=>c.event)),['appCatalogSources','appCatalogList','appCatalogList','appCatalogDraft']);
        assert.match(await page.evaluate(()=>window.calls.at(-1).input.source),/example\/catalog/);
        console.log(`PASS ${width}px: explicit fetch, unsupported templates, no HTML execution, review, edit parameters, draft only`);
        await page.close();
    }
} finally {await browser?.close();await server.close();}
