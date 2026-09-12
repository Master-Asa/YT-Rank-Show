'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),p=require('../record-policy');
const comment='<div class="yt-header-primary-text">贈送了 1 個「測試頻道 Example Ch.」會籍</div>';
const event={service:'youtube',liveId:'live0000001',eventId:'gift-one',eventIdSource:'comment-id',userId:'sender',eventType:'sponsorgift',timestamp:'2026-09-09T10:00:00Z',createdAt:'2026-09-09T10:00:01Z',comment,giftCount:0,giftCountSource:'unknown',auditReasons:['相同事件 ID 的內容衝突']};
test('真實備份格式：舊版缺少 ID 來源和模式，新版解析為零，三組只計三份',()=>{
 const rows=[];
 for(let i=0;i<3;i++){const base={...event,eventId:'id'+i,userId:'u'+i};
 rows.push({...base,giftCount:1,giftCountSource:undefined,eventIdSource:undefined,recordMode:undefined},
 {...base,recordMode:'production'});}
 const fixed=p.repairMembership(rows);assert.equal(fixed.repaired,6);
 assert.equal(p.rank(p.select(fixed.events),'gift').reduce((n,r)=>n+r.value,0),3);
 assert.equal(fixed.events.length,6);
});
test('修復介面先備份再寫入，備份失敗或取消不動原紀錄',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),source=fs.readFileSync(require.resolve('../membership-repair-ui.js'),'utf8');
 for(const mode of ['ok','cancel','failure']){
  const nodes=new Map(),writes=[],state={events:[{...event}]};
  const get=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)};
  const ctx={URLSearchParams,location:{search:''},RecordPolicy:p,state,connectionMode:'onesdk',CACHE_KEY:'cache',Date,JSON,$:get,text:(el,v)=>el.textContent=v,confirm:()=>mode!=='cancel',render(){},
   localStorage:{setItem(k,v){if(mode==='failure')throw new Error('quota');writes.push([k,v]);}}};
  vm.createContext(ctx);vm.runInContext(source,ctx);await get('repairMembership').onclick();
  if(mode==='ok'){assert.equal(writes.length,2);assert.match(writes[0][0],/before-membership-repair/);assert.equal(JSON.parse(writes[0][1])[0].giftCount,0);assert.equal(state.events[0].giftCount,1);}
  else{assert.equal(writes.length,0);assert.equal(state.events[0].giftCount,0);}
 }
});
test('支援繁中頻道會籍／簡中／HTML 訊息，不把受贈者當贈送者',()=>{
 assert.equal(p.gift({comment}).giftCount,1);
 assert.equal(p.gift({comment:'赠送了 10 个「名字123」会籍'}).giftCount,10);
 assert.equal(p.gift({comment:'@觀眾收到了 @送禮者贈送的會籍'}).giftCount,0);
});
test('可驗證舊數量與重複副本修復，保留原值且只計一次',()=>{
 const original=[event,{...event,giftCount:1,giftCountSource:undefined,originalAmount:1}],before=JSON.stringify(original);
 const r=p.repairMembership(original);assert.equal(r.repaired,2);assert.equal(JSON.stringify(original),before);
 assert.equal(p.rank(p.select(r.events),'gift')[0].value,1);assert.equal(r.events.length,2);
 assert.equal(r.events[0].membershipRepairBefore.giftCount,0);
 assert.equal(p.repairMembership(r.events).repaired,0);
 p.ingest(r.events,{...event,...p.gift({comment}),auditReasons:[]});
 assert.equal(r.events.length,2);assert.equal(p.rank(p.select(r.events),'gift')[0].value,1);
});
test('真正數量／身份／時間衝突不自動放行',()=>{
 for(const extra of [{comment:comment.replace('1 個','5 個')},{userId:'someone'},{timestamp:'2026-09-09T11:00:00Z'},{giftCount:2,giftCountSource:'structured:giftCount'}]){
  assert.equal(p.repairMembership([event,{...event,...extra}]).repaired,0);
 }
});
test('測試、清空與其他隔離仍有效；受贈紀錄不被修復',()=>{
 const r=p.repairMembership([{...event,recordMode:'test'},{...event,eventId:'second',auditReasons:['其他風險']},{...event,eventId:'received',eventType:'giftreceived'}]);
 assert.equal(p.select(r.events).length,0);assert.equal(r.events[2].giftCount,0);
 const repaired=p.repairMembership([event]).events;assert.equal(p.select(repaired,{},()=>true).length,0);
});
