'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const p=require('../record-policy');
function setup(){
  const elements=new Map(),downloads=[],blobs=new Map();
  function element(id){
    if(elements.has(id))return elements.get(id);
    const el={value:'',textContent:'',checked:false,disabled:false,children:[],
      replaceChildren(...children){this.children=children;this.value=children[0]?.value||'';},
      append(){},remove(){},click(){if(this.href)downloads.push({name:this.download,blob:blobs.get(this.href)});}};
    elements.set(id,el);return el;
  }
  const buttons=['detail','sc','gift','summary','backup'].map(kind=>({...element('button-'+kind),dataset:{export:kind}}));
  const base={schemaVersion:2,eventId:'1',service:'youtube',liveId:'live0000001',userId:'u',displayName:'甲',eventType:'superchat',
    timestamp:'2026-08-31T16:00:00Z',createdAt:'2026-09-09T00:00:00Z',amountTwd:100,exchangeRate:1,originalAmount:100,normalizedCurrency:'TWD'};
  const state={events:[base,{...base,eventId:'2',liveId:'live0000002',amountTwd:20,originalAmount:20},
    {...base,eventId:'test',recordMode:'test',amountTwd:999},{...base,eventId:'cleared'}],settings:{timezone:'Asia/Taipei'},session:{service:'youtube',liveId:'live0000001'}};
  element('exportScope').value='month';
  const context={RecordPolicy:p,$:element,state,isResetEvent:e=>e.eventId==='cleared',resetState:{at:1,ids:['cleared']},
    currentChannelLock:()=>({channelId:'UC'+'a'.repeat(22),bindings:Object.fromEntries(['live0000001','live0000002'].map(live=>[live,{channelId:'UC'+'a'.repeat(22),source:'manual-confirmation'}]))}),connectionMode:'onesdk',currentRecordMode:()=> 'production',Date,JSON,Blob,Map,Error,
    URL:{createObjectURL(blob){const url='blob:'+blobs.size;blobs.set(url,blob);return url;},revokeObjectURL(){}},
    setTimeout(){},localStorage:{setItem(){}},updateObsUrls(){},
    document:{querySelectorAll:()=>buttons,createElement:tag=>({...element('new-'+Math.random()),tag}),body:{append(){}}},
    MutationObserver:class{observe(){}}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../record-export.js'),'utf8'),context);
  element('exportMonth').value='2026-09';
  return {element,buttons,downloads,state};
}
test('下載月榜只包含有效紀錄，兩種排行榜分別匯出',async()=>{
  const x=setup();
  x.buttons.find(b=>b.dataset.export==='sc').onclick();
  assert.match(x.downloads[0].name,/2026-09-sc.csv/);
  const text=await x.downloads[0].blob.text();
  assert.match(text,/"120"/);assert.doesNotMatch(text,/999/);
  x.buttons.find(b=>b.dataset.export==='gift').onclick();
  assert.match(x.downloads[1].name,/gift.csv/);
});
test('指定直播明細與包含隔離選項，篩選不修改原資料',async()=>{
  const x=setup();x.element('exportScope').value='session';x.element('exportSession').value=JSON.stringify(['youtube','live0000001']);
  x.element('exportIncludeAll').checked=true;
  x.buttons.find(b=>b.dataset.export==='detail').onclick();
  const text=await x.downloads[0].blob.text();
  assert.match(text,/測試資料/);assert.match(text,/已清空/);assert.doesNotMatch(text,/"live0000002"/);
  assert.equal(x.state.events.length,4);
});
test('完整備份包含所有原紀錄、設定與清空界線，不受選定場次影響',async()=>{
  const x=setup();x.element('exportScope').value='session';x.element('exportSession').value='';
  x.buttons.find(b=>b.dataset.export==='backup').onclick();
  const data=JSON.parse(await x.downloads[0].blob.text());
  assert.equal(data.events.length,4);assert.deepEqual(data.reset.ids,['cleared']);assert.equal(data.schemaVersion,2);
});
test('沒有場次或月份非法時拒絕匯出，不偷偷匯出全部',()=>{
  const x=setup();x.element('exportScope').value='session';x.element('exportSession').value='';
  x.buttons[0].onclick();assert.equal(x.downloads.length,0);assert.match(x.element('exportNotice').textContent,/沒有/);
  x.element('exportScope').value='month';x.element('exportMonth').value='2026-99';x.buttons[0].onclick();
  assert.equal(x.downloads.length,0);assert.match(x.element('exportNotice').textContent,/有效/);
});
