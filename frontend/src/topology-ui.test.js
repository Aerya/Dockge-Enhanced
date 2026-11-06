import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parse } from '@vue/compiler-sfc';
import { stackIdentity } from '../../common/stack-groups';
import { topologyOwner } from '../../common/docker-topology';

const source = readFileSync(new URL('./pages/Topology.vue', import.meta.url), 'utf8');
const options = runInNewContext(parse(source).descriptor.script.content.replace(/^import .*;$/gm, '').replace('export default', 'result ='), { TopologyInstance: {}, stackIdentity, topologyOwner, setTimeout, clearTimeout });
const container = (id, extra = {}) => ({ id, name: id, stack: 'demo', service: 'web', external: false, state: 'running', mode: 'bridge', networks: [], ports: [], ...extra });
function context() {
    const c = { ...options.data(), $t: key => key, $root: { userAccess: { role: 'admin' }, agentList: { remote: {} }, endpointDisplayFunction: ep => ep || 'local' } };
    for (const [name, method] of Object.entries(options.methods)) c[name] = method.bind(c);
    for (const [name, getter] of Object.entries(options.computed)) Object.defineProperty(c, name, { get: () => getter.call(c) });
    return c;
}
test('custom groups isolate same-name stacks by endpoint; external and stopped filters are independent', () => {
    const c = context(); c.instance = '*';
    c.snapshots = { '': { containers: [container('local')] }, remote: { containers: [container('remote'), container('stopped', { state: 'exited' }), container('external', { external: true })] } };
    c.groups = [{ id: 'group', members: [stackIdentity({ name: 'demo', endpoint: 'remote' })] }]; c.group = 'group';
    assert.equal(c.entries.length, 1); assert.equal(c.entries[0].endpoint, 'remote');
    assert.equal(c.entries[0].containers.length, 2); c.external = false; assert.equal(c.entries[0].containers.length, 1);
    c.stopped = true; assert.equal(c.entries[0].containers.length, 2);
});
test('shared owner remains explicitly contextual instead of becoming a group member', () => {
    const c = context(); c.stack = stackIdentity({ name: 'demo' });
    c.snapshots = { '': { containers: [container('child', { mode: 'container:owner' }), container('owner', { stack: 'vpn', external: true })] } };
    c.external = false;
    assert.equal(c.entries[0].containers.length, 2); assert.equal(c.entries[0].contextIds[0], 'owner');
});
test('linked instance failure stays visible without removing a successful local snapshot', async () => {
    const c = context(); c.request = async (ep, event) => event === 'stackGroups:get' ? { ok: true, config: { preferences: { groups: [] } } } : ep ? { ok: false } : { ok: true, snapshot: { containers: [container('local')], networks: [] } };
    await c.load(); assert.equal(c.busy, false); assert.ok(c.snapshots['']); assert.equal(c.failures[0], 'remote');
});
test('disconnect invalidates late remote replies and cannot repopulate cleared state', async () => {
    const c = context(); let finish; const barrier = new Promise(resolve => { finish = resolve; });
    c.request = async () => { await barrier; return { ok: true, config: { preferences: { groups: [] } }, snapshot: { containers: [container('old')], networks: [] } }; };
    const pending = c.load(); c.invalidate(); finish(); await pending;
    assert.equal(Object.keys(c.snapshots).length, 0); assert.equal(c.busy, false);
});
test('restricted account cannot start collection', async () => {
    const c = context(); c.$root.userAccess.role = 'restricted'; c.request = () => { throw Error('must not call'); }; await c.load(); assert.equal(Object.keys(c.snapshots).length, 0);
});
test('all supported locales provide every topology label', () => {
    const en = JSON.parse(readFileSync(new URL('./lang/en.json', import.meta.url), 'utf8'));
    for(const locale of ['fr','en','de','es','zh-CN']) { const entries=JSON.parse(readFileSync(new URL('./lang/'+locale+'.json',import.meta.url),'utf8')); for(const key of Object.keys(en).filter(k=>k.startsWith('topology.'))) assert.ok(entries[key]?.trim(),locale+':'+key); }
});
