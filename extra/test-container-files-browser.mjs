import assert from "node:assert/strict";
import { createServer } from "vite";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({ configFile: "frontend/vite.config.ts", server: { host: "127.0.0.1", port: 0, open: false }, plugins: [{
    name: "container-files-fixture",
    resolveId(id) { if (id === "/__files.js") return id; },
    load(id) {
        if (id !== "/__files.js") return;
        return `import {createApp,h} from 'vue';import Files from '/src/components/ContainerFiles.vue';import 'bootstrap/dist/css/bootstrap.min.css';
window.calls=[];const app=createApp({data:()=>({labels:false}),methods:{emitAgent(endpoint,event,input,cb){window.calls.push({endpoint,event,input});if(event==='containerInstances'){cb({ok:true,instances:[{id:'a'.repeat(64),name:'app-1',service:'app',state:'running'},{id:'b'.repeat(64),name:'other',service:'other',state:'running'}]});return;}if(input.path==='/denied'){cb({ok:false,msg:'containerFiles.denied'});return;}cb({ok:true,data:input.action==='list'?{path:input.path,entries:[{name:'hello.txt',type:'file',size:30}],truncated:false}:{path:input.path,content:btoa('<script>window.xss=true</script>'),size:30}});}},render(){return h(Files,{stackName:'demo',serviceName:'app',endpoint:'linked',showLabels:this.labels});}});app.config.globalProperties.$t=k=>k;app.component('font-awesome-icon',{render:()=>null});window.vm=app.mount('#app');`;
    },
    configureServer(vite) { vite.middlewares.use((req,res,next)=>{if(req.url!=="/__files")return next();res.setHeader("Content-Type","text/html");res.end('<div id="app"></div><script type="module" src="/__files.js"></script>')}); },
}] });
let browser;
try {
    await server.listen();
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
    for (const width of [390,1280]) {
        const page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true});
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__files`);
        const action=page.getByRole('button',{name:'containerFiles.title',exact:true});
        assert.equal(await action.locator('span').isVisible(),false);
        await page.evaluate(()=>window.vm.labels=true);
        await action.locator('span').waitFor({state:'visible'});
        await action.click();
        await page.getByRole('button',{name:'hello.txt',exact:true}).waitFor();
        assert.equal(await page.locator('select option').count(),1);
        await page.getByRole('button',{name:'hello.txt',exact:true}).click();
        await page.locator('pre').waitFor();
        assert.match(await page.locator('pre').textContent(),/<script>/);
        assert.equal(await page.evaluate(()=>window.xss),undefined);
        const downloading=page.waitForEvent('download');
        await page.getByRole('button',{name:'containerFiles.download',exact:true}).click();
        assert.equal((await downloading).suggestedFilename(),'hello.txt');
        await page.getByRole('button',{name:'containerFiles.back',exact:true}).click();
        await page.getByLabel('containerFiles.path').fill('/denied');
        await page.getByRole('button',{name:'containerFiles.go',exact:true}).click();
        await page.getByRole('alert').filter({hasText:'containerFiles.denied'}).waitFor();
        assert.equal(await page.evaluate(()=>window.calls.every(c=>c.endpoint==='linked')),true);
        assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.event==='containerFilesRead').every(c=>c.input.id==='a'.repeat(64))),true);
        assert.deepEqual(errors,[]);
        console.log('PASS '+width+'px: service/replica selection, linked routing, safe preview, download and permission error');
        await page.close();
    }
} finally {await browser?.close();await server.close();}
