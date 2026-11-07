import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse } from "@vue/compiler-sfc";
import { reactive, computed } from "vue";
import { defaultUiPreferences } from "../../common/ui-preferences.ts";

const component = runInNewContext(parse(readFileSync(new URL("./pages/AppCatalog.vue", import.meta.url),"utf8")).descriptor.script.content
    .replace(/^import[^\n]+\n/gm,"").replace("export default","result ="), {BModal:{},setTimeout,clearTimeout,Date});
function catalog(emit) {
    const ctx=reactive({...component.data(),$root:{uiPreferencesLoaded:true,uiPreferences:defaultUiPreferences(),emitAgent:emit},$t:key=>key});
    for(const [name,method] of Object.entries(component.methods)) ctx[name]=method.bind(ctx);
    for(const [name,getter] of Object.entries(component.computed)) { const value=computed(()=>getter.call(ctx)); Object.defineProperty(ctx,name,{get:()=>value.value}); }
    ctx.sources=[{id:"lissy93",name:"First",format:"portainer",repo:"a/first",file:"main/templates.json"},{id:"portainer",name:"Second",format:"portainer",repo:"a/second",file:"main/templates.json"},{id:"umbrel",name:"Native",format:"umbrel"}];
    return ctx;
}
const response=source=>({ok:true,data:{source,revision:"r",items:[{index:0,title:"App",categories:["Média"],description:""}]}});
test("all enabled sources load automatically, disabled sources are not requested, errors are isolated",async()=>{
    const calls=[];
    const ctx=catalog((_,event,input,cb)=>{calls.push(input.source); cb(input.source.includes("first")?{ok:false,msg:"unavailable"}:response(input.source));});
    ctx.$root.uiPreferences.disabledCatalogSources=["umbrel"];
    assert.equal(ctx.sourceId,"all");
    await ctx.pollSources(); await ctx.pollSources(); await ctx.pollSources();
    assert.equal(calls.length,2);
    assert.equal(ctx.entries.length,1);
    assert.equal(ctx.sourceErrors.lissy93,"unavailable");
    ctx.categorySearch="media";
    assert.deepEqual([...ctx.visibleCategories],["média"]);
    ctx.categorySearch="absent";
    assert.equal(ctx.visibleCategories.length,0);
    ctx.$root.uiPreferences.disabledCatalogSources.push("portainer");
    assert.equal(ctx.entries.length,0);
    ctx.retrySource("lissy93");
    await ctx.pollSources();
    assert.equal(calls.length,3);
});
test("late catalog results after disabling a source or leaving the page cannot populate the gallery",async()=>{
    let callback;
    const ctx=catalog((_,event,input,cb)=>{callback=cb;});
    const request=ctx.pollSources();
    ctx.$root.uiPreferences.disabledCatalogSources=["lissy93"];
    component.watch.disabledSources.handler.call(ctx);
    callback(response("old"));
    await request;
    assert.equal(ctx.entries.length,0);
    assert.equal(ctx.backgroundBusy,false);
    const second=ctx.pollSources();
    ctx.disposed=true;
    callback(response("old"));
    await second;
    assert.equal(ctx.entries.length,0);
});
test("native indexers are bounded and polling rotates rather than starving later sources",async()=>{
    const calls=[];
    const ctx=catalog((_,event,input,cb)=>{calls.push(input.source);cb({ok:true,data:{...response(input.source).data,loading:true}});});
    ctx.sources=["umbrel","runtipi","yundera"].map(id=>({id,name:id,format:"native"}));
    await ctx.pollSources();await ctx.pollSources();await ctx.pollSources();
    assert.deepEqual(calls,["umbrel","runtipi"]);
    ctx.nextPoll.umbrel=0;ctx.nextPoll.runtipi=0;
    await ctx.pollSources();await ctx.pollSources();
    assert.deepEqual(calls,["umbrel","runtipi","umbrel","runtipi"]);
});

const preferencesMixin=runInNewContext(readFileSync(new URL("./mixins/ui-preferences.js",import.meta.url),"utf8")
    .replace(/^import[^\n]+\n/gm,"").replace("export default","result ="),
    {defaultUiPreferences,loadHiddenConsole:()=>false,localStorage:{}});
function preferences() {
    const callbacks=[];
    const ctx={...preferencesMixin.data(),loggedIn:true,userAccess:{role:"admin"},username:"alice",getSocket:()=>({timeout:()=>({emit:(...args)=>callbacks.push(args.at(-1))})}),$t:key=>key,toastError:()=>{}};
    for(const [name,method]of Object.entries(preferencesMixin.methods))ctx[name]=method.bind(ctx);
    return {ctx,callbacks};
}
test("preferences ignore old account responses, save without optimistic loss, fixed links remain visible",()=>{
    const {ctx,callbacks}=preferences();
    ctx.loadUiPreferences();
    ctx.username="bob";ctx.loadUiPreferences();
    callbacks[0](null,{ok:true,config:{revision:2,preferences:{hiddenNavigation:["files"],disabledCatalogSources:[]}}});
    assert.equal(ctx.uiPreferencesLoaded,false);
    callbacks[1](null,{ok:true,config:{revision:0,preferences:defaultUiPreferences()}});
    assert.equal(ctx.uiPreferencesLoaded,true);
    ctx.setNavigationVisible("files",false);
    assert.equal(ctx.navigationVisible("files"),true);
    callbacks[2](null,{ok:true,config:{revision:1,preferences:{hiddenNavigation:["files"],disabledCatalogSources:[]}}});
    assert.equal(ctx.navigationVisible("files"),false);
    assert.equal(ctx.navigationVisible("home"),true);
    assert.equal(ctx.navigationVisible("enhanced"),true);
});

test("busy catalog retries are delayed and bounded",async()=>{
    let count=0;
    const ctx=catalog((_,event,input,cb)=>{count++;cb({ok:false,msg:"appCatalog.busy"});});
    ctx.sources=ctx.sources.slice(0,1);
    await ctx.pollSources();await ctx.pollSources();
    assert.equal(count,1);
    ctx.nextPoll.lissy93=0;
    ctx.sourceStarted.lissy93=Date.now()-16*60*1000;
    await ctx.pollSources();await ctx.pollSources();
    assert.equal(count,1);
    assert.equal(ctx.sourceErrors.lissy93,"appCatalog.fetchFailed");
});

test("automatic login without a username still loads server-owned preferences",()=>{
    const {ctx,callbacks}=preferences();
    ctx.username=null;
    ctx.loadUiPreferences();
    assert.equal(callbacks.length,1);
    callbacks[0](null,{ok:true,config:{revision:0,preferences:defaultUiPreferences()}});
    assert.equal(ctx.uiPreferencesLoaded,true);
});
