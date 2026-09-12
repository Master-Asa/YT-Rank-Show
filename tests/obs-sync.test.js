'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),p=require('../record-policy'),rank=require('../rank-output'),lock=require('../channel-lock');
const {createResolverServer}=require('../scripts/resolver-server');
const channelLock=lock.bind({channelId:'UC'+'a'.repeat(22)},'live0000001'),settings={timezone:'Asia/Taipei',showTitle:true,rankNameSpaces:1,nameValueSpaces:2},now='2026-09-10T10:00:00Z';
const base={service:'youtube',liveId:'live0000001',eventId:'g',eventIdSource:'comment-id',userId:'sender',displayName:'贈送者',eventType:'sponsorgift',timestamp:now,comment:'贈送了 1 個「頻道」會籍',giftCount:0,giftCountSource:'unknown',recordMode:'production',auditReasons:['相同事件 ID 的內容衝突']};
const snapshot=events=>rank.snapshot({events,settings,session:{service:'youtube',liveId:'live0000001'},channelLock,isReset:()=>false,now},p);
test('修復後的管理頁與 OBS 使用同一格式，保留三位各一份、SC 不變',()=>{
 const events=[];for(let i=0;i<3;i++)events.push({...base,eventId:'g'+i,userId:'u'+i,displayName:'贈送者'+i},{...base,eventId:'g'+i,userId:'u'+i,displayName:'贈送者'+i,giftCount:1,giftCountSource:undefined,eventIdSource:undefined,recordMode:undefined});
 events.push({...base,eventId:'sc',eventType:'superchat',originalAmount:30,normalizedCurrency:'TWD',exchangeRate:1,amountTwd:30,auditReasons:[]});
 const repaired=p.repairMembership(events).events,s=snapshot(repaired);
 assert.equal(s.outputs['monthly-gift-3'],rank.format(p.rank(p.select(repaired,{channelLock,month:'2026-09'}),'gift').slice(0,3),'gift','monthly',settings));
 assert.equal((s.outputs['monthly-gift-3'].match(/1個/g)||[]).length,3);assert.match(s.outputs['monthly-sc-10'],/NT\$30/);
 const cleared=rank.snapshot({events:repaired,settings,session:{},channelLock,isReset:()=>true,now},p);
 assert.equal(cleared.outputs['current-gift-10'],'【本場 贈送會員 排行榜】');assert.doesNotMatch(cleared.outputs['monthly-gift-10'],/1個/);
});
test('跨月、其他頻道、測試及受贈資料不會透過同步混入',()=>{
 const valid={...base,...p.gift({comment:base.comment}),auditReasons:[]};
 const events=[valid,{...valid,eventId:'previous',timestamp:'2026-08-31T15:59:59Z'},{...valid,eventId:'other',liveId:'live0000002'},{...valid,eventId:'test',recordMode:'test'},{...valid,eventId:'received',eventType:'giftreceived'}];
 assert.equal((snapshot(events).outputs['monthly-gift-3'].match(/1個/g)||[]).length,1);
});
test('同步器可跨瀏覽器讀取；讀取 token 不能發布，非法來源與格式被拒',async()=>{
 const server=createResolverServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port,headers={Origin:'http://127.0.0.1:11180','Content-Type':'application/json'};
 try{
  const payload=snapshot([{...base,...p.gift({comment:base.comment}),auditReasons:[]}]);
  const pub=await fetch(url+'/obs/publish',{method:'POST',headers,body:JSON.stringify({writeToken:'a'.repeat(64),snapshot:payload})});assert.equal(pub.status,200);
  const token=(await pub.json()).readToken;assert.notEqual(token,'a'.repeat(64));
  const read=await fetch(url+'/obs/output/'+token,{headers});assert.equal(read.status,200);assert.deepEqual((await read.json()).outputs,payload.outputs);
  const attacker=await fetch(url+'/obs/publish',{method:'POST',headers,body:JSON.stringify({writeToken:token,snapshot:payload})});assert.notEqual((await attacker.json()).readToken,token);
  const bad=await fetch(url+'/obs/publish',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'});assert.equal(bad.status,403);
  const malformed=await fetch(url+'/obs/publish',{method:'POST',headers,body:JSON.stringify({writeToken:'a'.repeat(64),snapshot:{}})});assert.equal(malformed.status,400);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('停止發布超過 15 秒後不以過時結果冒充即時排行',async()=>{
 let time=1000;const bridge=require('../src/obs-bridge').createObsBridge({now:()=>time});let response;
 const send=(status,body)=>response={status,body},body=JSON.stringify({writeToken:'a'.repeat(64),snapshot:snapshot([])});
 const req={url:'/obs/publish',method:'POST',headers:{'content-type':'application/json'},async *[Symbol.asyncIterator](){yield Buffer.from(body);}};
 await bridge(req,send,true);const token=response.body.readToken;
 time+=15001;await bridge({url:'/obs/output/'+token,method:'GET'},send,true);assert.equal(response.status,409);
});
