/** Opt-in integration drills for fictitious local Docker fixtures. No host/daemon shutdowns. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const url = new URL(process.env.DOCKGE_LAB_URL || 'http://127.0.0.1:0');
assert.ok(['127.0.0.1','localhost'].includes(url.hostname) && url.protocol === 'http:' && Number(url.port) >= 1024 && url.port !== '5001' && url.pathname === '/' && !url.username && !url.password, 'Use a loopback test instance on a dedicated port');
assert.equal(process.env.DOCKGE_LAB_CONFIRM, 'FICTITIOUS DATA ONLY');
const config = JSON.parse(await fs.readFile(process.env.DOCKGE_LAB_MANIFEST, 'utf8'));
const token = (await fs.readFile(process.env.DOCKGE_LAB_TOKEN_FILE, 'utf8')).trim();
const docker = (...args) => execFileSync('docker',args,{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']}).trim();
const inspect = name => JSON.parse(docker('inspect',name))[0];
const instance = docker('ps','-q','--filter','publish='+url.port).split('\n').filter(Boolean);
assert.equal(instance.length,1,'Ambiguous or missing local test instance');
assert.ok(inspect(instance[0]).Config.Labels['dockge.test']?.startsWith('zerobyte-'),'Test instance must carry dockge.test=zerobyte-<lab id>');
const api = async (path,body) => {
 const response = await fetch(new URL('/api/watcher/zerobyte'+path,url),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const data = await response.json();assert.ok(data.ok,data.message || 'API operation failed');return data.data;
};
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
const state = await api('/workflows');
assert.equal(state.active,null,'An application lease is already active');
assert.ok((await api('/overview')).jobs.every(j=>j.enabled===false),'All laboratory jobs must be disabled');
const workflow = state.workflows.find(w=>w.id===config.workflowId && w.jobId===config.jobId);
assert.ok(workflow && /fixture/i.test(workflow.name),'Use an explicitly named fixture workflow');
assert.ok(Array.isArray(config.apps) && config.apps.length && Array.isArray(config.idle));
for(const name of [...config.apps,...config.idle]) {
 const c=inspect(name);assert.ok(workflow.stacks.includes(c.Config.Labels['com.docker.compose.project']));
 assert.ok(!c.Config.Image.includes('dockge') && !c.Config.Labels['net.dockge-enhanced.zerobyte-owner']);
}
const baselineIdle=config.idle.map(name=>({name,started:inspect(name).State.StartedAt}));
assert.ok(config.apps.every(name=>inspect(name).State.Running));
assert.ok(config.idle.every(name=>!inspect(name).State.Running));
const mode=process.argv[2] || 'smoke';assert.ok(['smoke','network-before','network-during'].includes(mode));
let disconnected=false;
function disconnect(){
 const c=inspect(config.server);const project=c.Config.Labels['com.docker.compose.project'];
 assert.match(project,/^zerobyte-.*(?:fixture|validation)$/);
 assert.ok(!c.Config.Labels['net.dockge-enhanced.zerobyte-owner'] && !config.apps.includes(config.server));
 const n=JSON.parse(docker('network','inspect',config.network))[0];assert.equal(n.Labels['com.docker.compose.project'],project);
 assert.ok(c.NetworkSettings.Networks[config.network]);docker('network','disconnect',config.network,config.server);disconnected=true;
}
const before=config.apps.map(name=>inspect(name).State.StartedAt);
const start=Date.now();
try {
 await api('/workflows/verify',{});
 if(mode==='network-before')disconnect();
 await api('/backups/'+config.jobId+'/run',{confirmation:'BACKUP'});
 if(mode==='network-during') {
  let prepared=false;
  for(let i=0;i<300;i++){await wait(100);const s=await api('/workflows');if(s.active?.workflow===workflow.id && config.apps.every(name=>!inspect(name).State.Running)){prepared=true;break;}}
  assert.ok(prepared,'Backup completed too quickly or never prepared applications');disconnect();
 }
 let outcome;
 for(let i=0;i<180;i++){await wait(1000);const s=await api('/workflows');outcome=s.events.find(e=>e.workflow===workflow.id&&e.at>=start&&['success','failure'].includes(e.state));if(outcome&&!s.active)break;}
 assert.equal(outcome?.state,mode==='smoke'?'success':'failure');
 assert.ok(config.apps.every(name=>inspect(name).State.Running),'Application recovery incomplete');
 if(mode==='network-before')assert.deepEqual(config.apps.map(name=>inspect(name).State.StartedAt),before);
 for(const x of baselineIdle){assert.equal(inspect(x.name).State.Running,false);assert.equal(inspect(x.name).State.StartedAt,x.started);}
 console.log(JSON.stringify({mode,passed:true,workflow:workflow.id,applicationsRecovered:true,idlePreserved:true}));
} finally { if(disconnected)docker('network','connect',config.network,config.server); }
// Acknowledge only after the backend has confirmed termination; no timeout bypass.
for(let i=0;i<90;i++){
 const s=await api('/workflows');if(!s.workflows.find(w=>w.id===workflow.id)?.blockedTasks.length)break;
 try{await api('/workflows/'+workflow.id+'/acknowledge',{confirmation:'ACKNOWLEDGE WORKFLOW'});break;}catch{assert.ok(i<89,'Interrupted task termination remains unverified');await wait(1000);}
}
