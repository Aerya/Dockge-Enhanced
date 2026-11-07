import assert from "node:assert/strict";
import { createServer } from "vite";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({
    configFile: "frontend/vite.config.ts", server: { host: "127.0.0.1", port: 0, open: false },
    plugins: [{
        name: "network-restart-fixture",
        resolveId(id) { if (id === "/__network.js") return id; },
        load(id) {
            if (id !== "/__network.js") return;
            return `
import {createApp,h} from 'vue';
import Dialog from '/src/components/NetworkRestartDialog.vue';
import 'bootstrap/dist/css/bootstrap.min.css';
window.calls=[];window.completed=0;
const app=createApp({
 methods:{emitAgent(endpoint,event,...args){
  window.calls.push({endpoint,event,args:args.slice(0,-1)});
  const cb=args.at(-1);
  if(event==='networkRestartExecute'){window.finish=cb;return;}
  cb({ok:true,token:'a'.repeat(64),containers:[
   {id:'vpn',name:'vpn',stack:'vpn-stack',service:'vpn',health:'healthy'},
   {id:'app',name:'app',stack:'app-stack',service:'app',health:''}
  ]});
 }},
 render(){return h(Dialog,{endpoint:'linked',stackName:'vpn-stack',onCompleted:()=>window.completed++});}
});
app.config.globalProperties.$t=k=>k;app.mount('#app');`;
        },
        configureServer(vite) { vite.middlewares.use((req,res,next)=>{
            if(req.url!=="/__network") return next();
            res.setHeader("Content-Type","text/html");res.end('<div id="app"></div><script type="module" src="/__network.js"></script>');
        }); },
    }],
});
let browser;
try {
    await server.listen();
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
    for(const width of [390,1280]){
        const page=await browser.newPage({viewport:{width,height:850}});
        const errors=[];page.on("pageerror",error=>errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__network`);
        await page.getByRole("button",{name:"networkRestart.confirm"}).waitFor();
        assert.deepEqual(await page.locator("ol li strong").allTextContents(),["vpn-stack / vpn","app-stack / app"]);
        assert.equal(await page.getByText("networkRestart.warning").count(),1);
        assert.equal(await page.getByText("networkRestart.noHealth",{exact:false}).count(),1);
        await page.getByRole("button",{name:"networkRestart.confirm"}).click();
        assert.equal(await page.getByRole("button",{name:"refresh",exact:true}).isDisabled(),true);
        const request=await page.evaluate(()=>window.calls.at(-1));
        assert.equal(request.endpoint,"linked");
        assert.deepEqual(request.args,["vpn-stack","a".repeat(64)]);
        await page.evaluate(()=>window.finish({ok:false,msg:"networkRestart.changed"}));
        await page.getByText("networkRestart.changed",{exact:true}).waitFor();
        assert.equal(await page.getByRole("button",{name:"networkRestart.confirm"}).isDisabled(),true);
        await page.getByRole("button",{name:"refresh",exact:true}).click();
        await page.getByRole("button",{name:"networkRestart.confirm"}).click();
        await page.evaluate(()=>window.finish({ok:true}));
        await page.waitForFunction(()=>window.completed===1);
        assert.deepEqual(errors,[]);
        console.log("PASS "+width+"px: preview order, warnings, linked endpoint, confirmation, stale plan, refresh and completion");
        await page.close();
    }
} finally {await browser?.close();await server.close();}
