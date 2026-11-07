import assert from "node:assert/strict";
import { createServer } from "vite";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({ configFile: "frontend/vite.config.ts", server: { host: "127.0.0.1", port: 0, open: false }, plugins: [{
    name: "deployment-fixture",
    resolveId(id) { if (id === "/__deployment.js") return id; },
    load(id) {
        if (id !== "/__deployment.js") return;
        return `import {createApp,h} from 'vue';import Progress from '/src/components/DeploymentProgress.vue';import 'bootstrap/dist/css/bootstrap.min.css';
window.calls=[];window.result={id:'one',stack:'demo',state:'failed',phase:'compose',saved:true,startedAt:new Date().toISOString(),steps:[{phase:'save',finishedAt:'now'},{phase:'compose'}],output:'<img src=x onerror=alert(1)> Docker failed'};
const app=createApp({data:()=>({socketIO:{connected:true}}),methods:{emitAgent(endpoint,event,...args){window.calls.push({endpoint,event,args:args.slice(0,-1)});const cb=args.at(-1);if(event==='deploymentRetry'){window.result={...window.result,id:'two',state:'running'};window.finish=cb;}else cb({ok:true,progress:window.result});}},render(){return h(Progress,{ref:'progress',stackName:'demo',endpoint:'linked'});}});app.config.globalProperties.$t=k=>k;window.vm=app.mount('#app');`;
    },
    configureServer(vite) { vite.middlewares.use((req,res,next)=>{if(req.url!=="/__deployment")return next();res.setHeader("Content-Type","text/html");res.end('<div id="app"></div><script type="module" src="/__deployment.js"></script>')}); },
}] });
let browser;
try {
    await server.listen();
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
    for (const width of [390,1280]) {
        const page=await browser.newPage({viewport:{width,height:900}});
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__deployment`);
        await page.getByRole('button',{name:'deployment.retry',exact:true}).waitFor();
        assert.equal(await page.locator('img').count(),0);
        assert.equal(await page.getByRole('button',{name:'deployment.retry',exact:true}).isDisabled(),true);
        await page.getByRole('checkbox').check();
        await page.getByRole('button',{name:'deployment.retry',exact:true}).click();
        assert.deepEqual(await page.evaluate(()=>window.calls.find(c=>c.event==='deploymentRetry')),{endpoint:'linked',event:'deploymentRetry',args:['demo','one']});
        await page.getByRole('heading',{name:'deployment.title — deployment.running'}).waitFor();
        await page.evaluate(async()=>{window.vm.socketIO.connected=false;await window.vm.$nextTick();window.result={...window.result,state:'completed',output:undefined};window.vm.socketIO.connected=true;});
        await page.getByRole('heading',{name:'deployment.title — deployment.completed'}).waitFor();
        await page.getByText('deployment.noConsole',{exact:true}).waitFor();
        await page.evaluate(()=>window.finish({ok:true}));
        assert.deepEqual(errors,[]);
        console.log('PASS '+width+'px: failure, escaped output, explicit retry, linked endpoint, reconnect final state');
        await page.close();
    }
} finally {await browser?.close();await server.close();}
