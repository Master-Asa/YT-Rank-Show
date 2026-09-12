'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const p=require('../record-policy'),core=require('../src/core');
const valid=(extra={})=>({schemaVersion:2,eventId:'e1',eventIdSource:'comment-id',service:'youtube',liveId:'live-a',userId:'user-a',displayName:'甲',
  eventType:'superchat',timestamp:'2026-09-09T10:00:00Z',createdAt:'2026-09-09T10:00:01Z',
  originalAmount:100,normalizedCurrency:'TWD',exchangeRate:1,amountTwd:100,recordMode:'production',...extra});
test('有效 SC、貼圖可計入；受贈紀錄不計贈送榜',()=>{
  assert.equal(p.eligible(valid()),true);
  assert.equal(p.eligible(valid({eventType:'supersticker'})),true);
  assert.equal(p.eligible(valid({eventType:'giftreceived'})),false);
});
test('測試標記及已知 youtube-test 場次隔離，不依姓名猜測',()=>{
  for(const data of [{recordMode:'test'},{explicitTest:true},{liveId:'youtube-test'}])assert.equal(p.eligible(valid(data)),false);
  assert.equal(p.eligible(valid({displayName:'測試使用者'})),true);
});
test('缺少來源、身份、時間及未知金額都不入榜',()=>{
  for(const data of [{service:''},{liveId:'unknown'},{userId:''},{eventIdSource:'fallback'},{timestamp:''},{timestamp:'garbage'},
    {timestamp:'2026-10-01T00:00:00Z'},{amountTwd:NaN},{exchangeRate:-1},{originalAmount:0},{normalizedCurrency:null}])
    assert.equal(p.eligible(valid(data)),false,JSON.stringify(data));
});
test('贈送數量不使用留言第一個數字，保留解析來源',()=>{
  assert.equal(p.gift({comment:'2026 user123: 謝謝大家'}).giftCount,0);
  assert.equal(p.gift({comment:'user123 贈送了 10 個會員'}).giftCount,10);
  assert.equal(p.gift({comment:'Gifted 20 memberships'}).giftCount,20);
  assert.equal(p.gift({comment:'10 件のメンバーシップ ギフト'}).giftCount,10);
  assert.equal(p.gift({giftCount:5,comment:'100 個會員'}).giftCount,5);
  for(const giftCount of [-1,1.5,'bad'])assert.equal(p.gift({giftCount}).giftCount,0);
  assert.equal(p.eligible(valid({eventType:'sponsorgift',giftCount:10})),false);
  assert.equal(p.eligible(valid({eventType:'sponsorgift',...p.gift({giftCount:10})})),true);
});
test('重送去重；同 ID 跨直播分開；衝突双方隔離',()=>{
  const events=[];p.ingest(events,valid());p.ingest(events,valid({displayName:'更新名稱'}));
  assert.equal(events.length,1);
  p.ingest(events,valid({liveId:'live-b'}));assert.equal(events.length,2);
  p.ingest(events,valid({originalAmount:200,amountTwd:200}));
  assert.equal(events.length,3);
  assert.equal(p.select(events).length,1);
  const restored=[];for(const e of JSON.parse(JSON.stringify(events)))p.ingest(restored,e);
  assert.equal(p.select(restored).length,1);
});
test('測試事件重播不能變正式；清空排除仍可完整匯出',()=>{
  const events=[valid({recordMode:'test'})];p.ingest(events,valid());
  assert.equal(p.select(events).length,0);
  const reset=e=>e.eventId==='e1';
  assert.equal(p.select([valid()],{},reset).length,0);
  assert.equal(p.select([valid()],{includeAll:true},reset).length,1);
  assert.match(p.details([valid()],reset),/已清空/);
});
test('台北月份邊界含首不含尾，年份不同不能混入',()=>{
  const events=['2026-08-31T15:59:59Z','2026-08-31T16:00:00Z','2026-09-30T15:59:59Z','2026-09-30T16:00:00Z','2025-09-01T00:00:00Z']
    .map((timestamp,i)=>valid({eventId:String(i),timestamp,createdAt:'2026-10-02T00:00:00Z'}));
  assert.deepEqual(p.select(events,{month:'2026-09',timezone:'Asia/Taipei'}).map(e=>e.eventId),['1','2']);
});
test('指定直播僅選該平台及 liveId；月榜跨場依 userId 合併',()=>{
  const a=valid(),b=valid({eventId:'b',liveId:'live-b',timestamp:'2026-09-09T10:00:01Z',displayName:'新名字'}),
    other=valid({eventId:'c',userId:'other',displayName:'新名字'});
  assert.equal(p.select([a,b,other],{service:'youtube',liveId:'live-a'}).length,2);
  const rows=p.rank(p.select([b,a,other],{month:'2026-09'}),'sc');
  assert.equal(rows.length,2);assert.equal(rows[0].value,200);assert.equal(rows[0].displayName,'新名字');
});
test('CSV 含 BOM、正確引號及公式注入防護',()=>{
  const csv=p.csv([['姓名','留言'],['@viewer','=HYPERLINK("evil")'],['甲,乙','多\n行'],[' +1','正常']]);
  assert.equal(csv.charCodeAt(0),0xFEFF);
  assert.ok(csv.includes('"\'@viewer"'));assert.ok(csv.includes('"\'=HYPERLINK(""evil"")"'));
  assert.ok(csv.includes('"甲,乙"'));assert.ok(csv.includes('"多\n行"'));
});
test('Node 正規化不虛構本場、時間或把連線 ID 當事件 ID',()=>{
  const e=core.normalizeEvent({id:'connection',service:'youtube',data:{type:'superchat',userId:'u',paidText:'NT$70'}},{liveId:'active'},core.DEFAULT_SETTINGS);
  assert.equal(e.liveId,'unknown');assert.equal(e.timestamp,'');assert.equal(e.eventIdSource,'fallback');
  assert.equal(core.rank([e]).length,0);
});
function browserContext(){
  const source=fs.readFileSync(require.resolve('../admin.js'),'utf8');
  const storage=new Map();
  const ctx={RecordPolicy:p,URLSearchParams,location:{search:''},Date,Number,String,JSON,Map,connectionMode:'onesdk',
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    state:{settings:{...core.DEFAULT_SETTINGS},session:{liveId:'active'},events:[]},
    observeSession:()=>{},render:()=>{},text:()=>{},$:()=>({}),isResetEvent:()=>false};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function sdkMoney('),source.indexOf('// Session selection')),ctx);
  vm.runInContext("const CACHE_KEY='cache';\n"+source.slice(source.indexOf('function sdkComments('),source.indexOf('function sdkMeta(')),ctx);
  return {ctx,storage};
}
test('瀏覽器接收與核心一致，超過 5000 筆不截斷',()=>{
  const {ctx,storage}=browserContext();
  const item={id:'connection',service:'youtube',data:{id:'event',liveId:'live-a',userId:'u',type:'superchat',timestamp:'2026-09-09T10:00:00Z',paidText:'NT$100'}};
  const e=ctx.sdkEvent(item);assert.equal(e.eventId,'event');assert.equal(e.liveId,'live-a');
  assert.equal(ctx.sdkEvent({...item,data:{...item.data,liveId:null,timestamp:null,id:null}}).liveId,'unknown');
  ctx.state.events=Array.from({length:5001},(_,i)=>valid({eventId:String(i)}));
  ctx.sdkComments([item,item]);
  assert.equal(ctx.state.events.length,5002);assert.equal(JSON.parse(storage.get('cache')).length,5002);
});
test('瀏覽器儲存失敗不刪除事件',()=>{
  const {ctx}=browserContext();let message='';
  ctx.localStorage.setItem=()=>{throw new Error('quota')};ctx.text=(el,value)=>{message=value};
  ctx.sdkComments([{service:'youtube',data:{id:'a',type:'sponsorgift',giftCount:2,liveId:'live',userId:'u',timestamp:'2026-09-09T10:00:00Z'}}]);
  assert.equal(ctx.state.events.length,1);assert.match(message,/儲存失敗/);
});

test('拒絕缺少時區、日期自動溢位及無效時間',()=>{
  for(const timestamp of ['2026-09-09 12:00:00','2026-02-30T00:00:00Z','2026-09-09T24:00:00Z','9'])
    assert.equal(p.eligible(valid({timestamp})),false,timestamp);
  assert.equal(p.dateParts('2026-09-01T00:00:00+08:00').month,'2026-09');
});
test('上游明確測試標記的重送不能被去重邏輯忽略',()=>{
  const events=[valid()];p.ingest(events,valid({explicitTest:true}));
  assert.equal(events.length,1);assert.equal(p.eligible(events[0]),false);
});
test('損壞的瀏覽器紀錄停止恢復，不覆寫原儲存',()=>{
  const source=fs.readFileSync(require.resolve('../admin.js'),'utf8');
  let writes=0;
  const ctx={JSON,Array,Error,CACHE_KEY:'cache',state:{events:[]},localStorage:{getItem:()=>'{broken',setItem:()=>writes++}};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function restoreBrowserEvents('),source.indexOf('async function connectSDK(')),ctx);
  assert.throws(()=>ctx.restoreBrowserEvents(),/停止收錄/);assert.equal(writes,0);
  ctx.localStorage.getItem=()=>JSON.stringify([null]);assert.throws(()=>ctx.restoreBrowserEvents(),/格式/);
});
test('runtime 衝突及明確測試標記重啟後仍隔離',async()=>{
  const {createRuntime}=require('../src/runtime'),fsp=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'yt-rank-policy-'));
  const item=(id,price,extra={})=>({service:'youtube',data:{id,liveId:'real-live',type:'superchat',userId:'u',timestamp:'2026-09-01T00:00:00Z',price,unit:'TWD',...extra}});
  const runtime=await createRuntime({dir,store:{store:{}}});
  await runtime.subscribe('comments',[item('conflict',100),item('conflict',200),item('explicit',10),item('explicit',10,{isTest:true}),item('valid',30)]);
  assert.equal(core.rank(runtime.events)[0].value,30);await runtime.close();
  const restored=await createRuntime({dir,store:{store:{}}});
  assert.equal(core.rank(restored.events)[0].value,30);await restored.close();
});
