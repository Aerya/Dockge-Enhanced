import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const runner = fileURLToPath(new URL('./check.mjs',import.meta.url));
test('laboratory runner refuses production port and non-loopback targets before reading credentials',()=>{
 for(const url of ['http://127.0.0.1:5001','http://192.0.2.1:5055','https://example.com:5055']) {
  const result=spawnSync(process.execPath,[runner],{env:{...process.env,DOCKGE_LAB_URL:url,DOCKGE_LAB_CONFIRM:'FICTITIOUS DATA ONLY'},encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Use a loopback test instance/);
 }
});
test('laboratory runner requires explicit fictitious-data confirmation before reading credentials',()=>{
 const result=spawnSync(process.execPath,[runner],{env:{...process.env,DOCKGE_LAB_URL:'http://127.0.0.1:5055',DOCKGE_LAB_CONFIRM:''},encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/FICTITIOUS DATA ONLY/);
});
