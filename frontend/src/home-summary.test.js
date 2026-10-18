import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateHomeValues, homeSummaryValue, homeInstanceLink } from './home-summary.js';

test('remote updates contribute even when local instance is up to date', () => {
    const values = [0, 6, 2].map(count => homeSummaryValue({enabled: true, count}, 'images'));
    assert.equal(values[0].state, 'ok');
    assert.equal(aggregateHomeValues(values).count, 8);
    assert.equal(aggregateHomeValues(values).state, 'warn');
});
test('offline and old agents cannot create an all-clear global status', () => {
    const result = aggregateHomeValues([homeSummaryValue({enabled:true,count:0}, 'images'), homeSummaryValue(null, 'images')]);
    assert.equal(result.state, 'unavailable');
    assert.equal(result.missing, 1);
    assert.equal(aggregateHomeValues([null]).state, 'unavailable');
});
test('backup coverage excludes disabled instances and detects overdue or absent backups', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    const values = [
        {enabled:true,timestamp:'2026-10-18T11:00:00Z',intervalHours:24},
        {enabled:true,timestamp:'2026-10-15T11:00:00Z',intervalHours:24},
        {enabled:true,timestamp:null,intervalHours:24},
        {enabled:false},
    ].map(data => homeSummaryValue(data, 'backup', now));
    const result = aggregateHomeValues(values, true);
    assert.equal(result.healthy, 1);
    assert.equal(result.enabled, 3);
    assert.equal(result.disabled, 1);
    assert.equal(result.state, 'warn');
});
test('all disabled is distinct from healthy and malformed counters are unavailable', () => {
    assert.equal(aggregateHomeValues([{state:'disabled'}]).state, 'disabled');
    assert.equal(homeSummaryValue({enabled:true}, 'images').state, 'unavailable');
});
test('remote links retain deployment prefix and never expose credentials', () => {
    assert.equal(homeInstanceLink('https://user:secret@example.test/dockge/', 'backup'), 'https://example.test/dockge/watcher?tab=backup');
    assert.equal(homeInstanceLink('javascript:alert(1)', 'images'), null);
    assert.equal(homeInstanceLink('invalid', 'images'), null);
});

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parse } from '@vue/compiler-sfc';
const { descriptor } = parse(readFileSync(new URL('./pages/DashboardHome.vue', import.meta.url), 'utf8'));
const component = runInNewContext(descriptor.script.content.replace(/^import .*;$/gm, '').replace('export default', 'result ='), {
    aggregateHomeValues, homeSummaryValue, homeInstanceLink,
    statusNameShort: value => value,
});
test('homepage keeps local stacks first and totals independent of sidebar filters', () => {
    const context = {
        $root: {
            completeStackList: Object.fromEntries([
                ...Array.from({length:10}, (_, i) => ['local'+i, {endpoint:'',status:'active'}]),
                ...Array.from({length:45}, (_, i) => ['remote'+i, {endpoint:'remote',status:'active'}]),
                ...Array.from({length:11}, (_, i) => ['other'+i, {endpoint:'other',status:'active'}]),
            ]),
            agentStatusList: {'':'online',remote:'online',other:'online'},
        },
        selectedAgentFilters: [''],
    };
    context.getStatusNum = component.methods.getStatusNum.bind(context);
    assert.equal(component.computed.activeNum.call(context), 10);
    assert.equal(context.getStatusNum('active'), 66);
    context.$root.agentStatusList.remote = 'offline';
    assert.equal(context.getStatusNum('active'), 21);
});
test('container totals include remote instances and omit offline cached data', () => {
    const context = {
        $root: {agentStatusList:{'':'online',remote:'online',offline:'offline'}},
        instanceContainerCounts: {'':{running:10},remote:{running:91},offline:{running:9}},
        selectedAgentFilters:[''],
    };
    assert.equal(component.computed.containerCounts.call(context).running, 101);
});
test('per-instance detail immediately marks offline cached summaries unavailable', () => {
    const context = {$root:{agentStatusList:{remote:'offline'}},instanceHomeSummaries:{remote:{images:{enabled:true,count:0}}}};
    assert.equal(component.methods.instanceHomeValue.call(context, 'remote', 'images').state, 'unavailable');
});

import * as Vue from 'vue';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
test('renders local/global cards, expandable remote links and incomplete status', async () => {
    const source = descriptor.template.content;
    const template = '<div>' + source.slice(source.indexOf('<!-- Stats -->'), source.indexOf('<!-- Docker Run -->')) + '</div>';
    const render = new Function('Vue', compile(template, {mode:'function', prefixIdentifiers:true}).code)(Vue);
    const view = {...component, render, mounted: undefined, beforeUnmount: undefined,
        data() {return {...component.data(), instanceHomeSummaries:{'':{images:{enabled:true,count:0}},remote:{images:{enabled:true,count:8}}}};},
    };
    const app = Vue.createSSRApp({
        data: () => ({agentList:{'':{displayName:'Local'},remote:{displayName:'Remote',url:'https://remote.example/'}},agentStatusList:{'':'online',remote:'online'},completeStackList:{}}),
        render: () => Vue.h(view),
    });
    app.config.globalProperties.$t = (key, args) => args ? key + JSON.stringify(args) : key;
    app.config.globalProperties.$tc = key => key;
    app.component('router-link', {props:['to'],render(){return Vue.h('a',{href:this.to},this.$slots.default());}});
    app.component('font-awesome-icon', {render:()=>Vue.h('i')});
    const html = await renderToString(app);
    assert.match(html, /home.scope.instance/);
    assert.match(html, /home.scope.global/);
    assert.match(html, /<details/);
    assert.match(html, /https:\/\/remote.example\/watcher\?tab=images/);
    assert.match(html, /target="_blank" rel="noopener noreferrer"/);
    assert.match(html, /home.scope.partial/);
});
