'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const lock=require('../channel-lock'),p=require('../record-policy'),core=require('../src/core');
const A='UC'+'a'.repeat(22),B='UC'+'b'.repeat(22),V1='live0000001',V2='live0000002',V3='live0000003';
function config(){
  let cfg=lock.bind({channelId:A},V1);
  cfg=lock.bind(cfg,V3);cfg=lock.bind({...cfg,channelId:B},V2);
  return {...cfg,channelId:A};
}
const event=(liveId,amount=100,extra={})=>({
  eventId:liveId,eventIdSource:'comment-id',service:'youtube',liveId,userId:B,displayName:'同一位觀眾',
  eventType:'superchat',timestamp:'2026-09-09T00:00:00Z',createdAt:'2026-09-09T00:00:01Z',
  originalAmount:amount,exchangeRate:1,amountTwd:amount,normalizedCurrency:'TWD',...extra
});
test('頻道格式、直播 URL 驗證，不接受 handle、外部主機或觀眾身份當歸屬',()=>{
  assert.equal(lock.parseChannel(A),A);assert.equal(lock.parseChannel('https://www.youtube.com/channel/'+A),A);
  for(const value of ['@handle','https://youtube.com.evil/channel/'+A,'https://evil/channel/'+A,'UC123'])
    assert.equal(lock.parseChannel(value),'');
  assert.equal(lock.parseLive('https://youtu.be/'+V1+'?t=1'),V1);
  assert.equal(lock.parseLive('https://www.youtube.com/watch?v='+V1),V1);
  assert.equal(lock.parseLive('https://www.youtube.com/live/'+V1),V1);
  assert.equal(lock.parseLive('https://evil/watch?v='+V1),'');
  assert.notEqual(lock.reason({channelId:A},event(V1,100,{userId:A,channelId:A,isOwner:true})),'');
});
test('未設定、未知場次、另一頻道皆不計榜；原始事件不變',()=>{
  const e=Object.freeze(event(V1));assert.equal(p.select([e],{channelLock:{}}).length,0);
  assert.equal(p.select([event(V2),event('unconfirmed')],{channelLock:config()}).length,0);
  assert.equal(p.select([e],{channelLock:config()}).length,1);assert.equal(e.userId,B);
});
test('同觀眾跨兩頻道的 SC 不合併，鎖定頻道跨場可合併',()=>{
  const events=[event(V1,100),event(V2,900),event(V3,30)];
  const filter={channelLock:config(),month:'2026-09',timezone:'Asia/Taipei'};
  const rows=p.rank(p.select(events,filter),'sc');assert.equal(rows.length,1);assert.equal(rows[0].value,130);
  for(const period of ['today','monthly','all_time']){
    const rows=core.rank(events,{period,channelLock:config(),now:'2026-09-09T08:00:00Z'});
    assert.equal(rows[0].value,130,period);
  }
  assert.equal(core.rank(events,{period:'current',service:'youtube',liveId:V2,channelLock:config()}).length,0);
});
test('贈送榜同樣套用頻道鎖，giftreceived 永遠不計',()=>{
  const events=[event(V1,0,{eventType:'sponsorgift',giftCount:5,giftCountSource:'structured:giftCount'}),
    event(V2,0,{eventType:'sponsorgift',giftCount:99,giftCountSource:'structured:giftCount'}),
    event(V1,0,{eventId:'receiver',eventType:'giftreceived',giftCount:1})];
  assert.equal(p.rank(p.select(events,{channelLock:config()}),'gift')[0].value,5);
});
test('切換鎖定頻道不刪歷史，不准直接覆蓋已有的不同歸屬',()=>{
  const c=config(),changed={...c,channelId:B},events=[event(V1),event(V2,900)];
  assert.equal(p.select(events,{channelLock:changed})[0].liveId,V2);
  assert.throws(()=>lock.bind(changed,V1),/不能直接覆蓋/);
  assert.equal(c.bindings[V1].channelId,A);assert.equal(events.length,2);
  assert.equal(lock.bind(c,V1).bindings[V1].confirmedAt,c.bindings[V1].confirmedAt);
});
test('OBS URL 只帶鎖定頻道場次；未带參數的舊 URL 不放行',()=>{
  const params=new URLSearchParams('obs=sc');lock.writeQuery(params,config());
  assert.equal(params.get('channel'),A);assert.equal(params.get('lives'),[V1,V3].join(','));
  const remote=lock.fromQuery(params);assert.equal(lock.allows(remote,V1),true);assert.equal(lock.allows(remote,V2),false);
  assert.equal(lock.allows(lock.fromQuery(new URLSearchParams('obs=sc')),V1),false);
});
test('含隔離的稽核匯出保留外頻道狀態與身份，預設匯出只含指定頻道',()=>{
  const events=[event(V1),event(V2)],cfg=config();
  assert.equal(p.select(events,{channelLock:cfg}).length,1);
  const all=p.select(events,{channelLock:cfg,includeAll:true});
  const csv=p.details(all,undefined,cfg);
  assert.match(csv,/非鎖定的實況主頻道/);assert.ok(csv.includes(A));assert.ok(csv.includes(B));assert.equal(all.length,2);
});
test('本場只選鎖定頻道，其他連線、清空與重播不挾持本場',()=>{
  const source=fs.readFileSync(require.resolve('../admin.js'),'utf8');
  const ctx={state:{session:{},events:[]},ChannelLock:lock,channelAllowsLive:id=>lock.allows(config(),id),URL,render(){},text(){},$(){return {}},OneSDK:{}};
  vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('let liveServices'),source.indexOf('function sdkComments')),ctx);
  const service=(id,live)=>({id,url:'https://youtube.com/watch?v='+live,enabled:true});
  ctx.applyServices([service('b',V2),service('a',V1)]);assert.equal(ctx.state.session.liveId,V1);
  ctx.observeSession({id:'b',service:'youtube',data:{liveId:V2}});assert.equal(ctx.state.session.liveId,V1);
  ctx.applyServices([service('b',V2)]);assert.equal(ctx.state.session.liveId,undefined);
  ctx.observeSession({id:'b',service:'youtube',data:{liveId:V1}});assert.equal(ctx.state.session.liveId,undefined);
  ctx.applyServices([{id:'a',url:'https://youtube.com/channel/'+A,enabled:true}]);
  ctx.observeSession({id:'a',service:'youtube',data:{liveId:V1}});assert.equal(ctx.state.session.liveId,undefined);
  ctx.applyServices([]);assert.equal(ctx.state.session.liveId,undefined);
});
test('Node runtime TXT 在未設定時為空榜，設定後僅輸出指定頻道並可重啟',async()=>{
  const fsp=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createRuntime}=require('../src/runtime');
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'yt-channel-lock-')),store={store:{}};
  const r=await createRuntime({dir,store});
  const item=(live,price)=>({service:'youtube',data:{id:live,liveId:live,userId:'viewer',type:'superchat',price,unit:'TWD',timestamp:'2026-09-09T00:00:00Z'}});
  await r.subscribe('comments',[item(V1,100),item(V2,900)]);
  const file=path.join(dir,'output/all_time_sc_top10.txt');
  assert.doesNotMatch(await fsp.readFile(file,'utf8'),/NT\$/);
  assert.equal((await r.request({method:'PUT',body:JSON.stringify({channelLock:config()})})).code,200);
  const value=await fsp.readFile(file,'utf8');assert.match(value,/NT\$100/);assert.doesNotMatch(value,/900/);
  await r.close();const restored=await createRuntime({dir,store});
  assert.match(await fsp.readFile(file,'utf8'),/NT\$100/);assert.equal(restored.events.length,2);await restored.close();
});
