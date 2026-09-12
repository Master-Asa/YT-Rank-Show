'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('啟動與未同意不查詢；查詢不保存，改輸入丟棄舊結果',async()=>{
 const elements={};const el=id=>elements[id]||(elements[id]={value:'',textContent:'',checked:false,hidden:true,handlers:{},addEventListener(k,fn){this.handlers[k]=fn;}});
 let calls=0,save=0,resolve;
 const ctx={$:el,window:{},MutationObserver:class{observe(){}},PublicResolver:require('../public-resolver'),LocalRuntime:{request:()=>{calls++;return new Promise(r=>resolve=r);}},YTChannelAdmin:{applyResolution:()=>{save++;}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../channel-resolver-ui'),'utf8'),ctx);
 assert.equal(calls,0);el('channelIdInput').value='@test';await el('queryChannel').onclick();assert.equal(calls,0);assert.match(el('channelSetupNotice').textContent,/同意/);
 el('channelLookupConsent').checked=true;const pending=el('queryChannel').onclick();assert.equal(calls,1);
 el('channelIdInput').value='@other';el('channelIdInput').handlers.input();resolve({});await pending;
 assert.equal(el('channelLookupResult').hidden,true);assert.equal(save,0);
});
