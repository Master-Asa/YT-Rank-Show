'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const p=require('../record-policy'),core=require('../src/core'),lock=require('../channel-lock');
const V='live0000001',A='UC'+'a'.repeat(22);
const config=lock.bind({channelId:A},V);
function item(count=1,unit=100,extra={}){return {service:'youtube',data:{id:'anchor',liveId:V,userId:'viewer',name:'Alice',
  timestamp:'2026-09-09T10:00:00Z',giftType:'jewel',giftId:'combo#anchor',giftCount:count,jewels:unit,
  price:unit*count,currency:'TWD',paidText:'💎'+unit*count,...extra}};}
const norm=x=>core.normalizeEvent(x,{},core.DEFAULT_SETTINGS,new Date('2026-09-10T00:00:00Z'));
test('OBS 寶石來源只顯示獨立數字，無本場時空白、月份依台北時間',()=>{
 const s=fs.readFileSync(require.resolve('../admin.js'),'utf8'),nodes=new Map();let callback;
 const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',style:{}});return nodes.get(id)};
 const now=new Date(),e=norm(item(3));e.timestamp=now.toISOString();e.createdAt=e.timestamp;
 const ctx={RecordPolicy:p,URLSearchParams,Date,location:{search:'?obs=jewel&period=current'},$:el,
 document:{createElement:()=>el('direct'),querySelector:()=>el('shell'),body:{style:{},append(){}}},
 state:{events:[e],settings:{timezone:'Asia/Taipei'},session:{service:'youtube',liveId:V}},
 currentChannelLock:()=>config,isResetEvent:()=>false,MutationObserver:class{constructor(cb){callback=cb}observe(){}}};
 vm.createContext(ctx);vm.runInContext(s.slice(s.indexOf('const OBS_MODE='),s.indexOf('function preview()')),ctx);
 assert.equal(el('direct').textContent,'300');assert.equal(el('kind').value,'sc');
 ctx.state.events=[norm(item(5))];callback();assert.equal(el('direct').textContent,'500');
 ctx.state.session={};callback();assert.equal(el('direct').textContent,'');
 assert.equal(p.jewelTotal(ctx.eventsFor('monthly')),500);
 ctx.state.events[0].timestamp='2020-01-01T00:00:00Z';assert.equal(p.jewelTotal(ctx.eventsFor('monthly')),0);
});
test('寶石使用單值乘累計份數，不混入金額、會員或任何榜',()=>{
 const e=norm(item(3));assert.equal(e.jewelTotal,300);assert.equal(e.amountTwd,null);assert.equal(e.originalAmount,null);assert.equal(e.giftCount,0);
 assert.equal(p.eligible(e),true);assert.deepEqual(p.rank([e],'sc'),[]);assert.deepEqual(p.rank([e],'gift'),[]);
 assert.equal(p.jewel({jewels:5}).jewelTotal,5);
 for(const jewels of [undefined,null,'',true,0,-1,1.2,'invalid'])assert.equal(p.jewel({jewels,giftCount:2}).jewelTotal,null);
 assert.equal(p.jewel({jewels:100,giftCount:0}).jewelTotal,null);
 assert.equal(p.jewel({jewels:Number.MAX_SAFE_INTEGER,giftCount:2}).jewelTotal,null);
});
test('同一連送 1→3→2→3 只計最高累計；重啟還原不重複',()=>{
 const events=[];for(const c of [1,3,2,3])p.ingest(events,norm(item(c)));
 assert.equal(events.length,1);assert.equal(p.jewelTotal(events),300);
 const restored=[];for(const c of [3,1,3])p.ingest(restored,norm(item(c)));assert.equal(p.jewelTotal(restored),300);
 p.ingest(events,norm(item(2,100,{id:'second',giftId:'other#second'})));assert.equal(p.jewelTotal(events),500);
});
test('缺寶石值先隔離，後補可更新；不同單值、身份或模式衝突不入統計',()=>{
 const events=[];p.ingest(events,norm(item(3,undefined,{jewels:undefined})));assert.equal(p.eligible(events[0]),false);
 p.ingest(events,norm(item(3)));assert.equal(p.eligible(events[0]),true);assert.equal(p.jewelTotal(events),300);
 for(const change of [{jewelUnit:200},{userId:'other'},{recordMode:'test'}]){
  const list=[];p.ingest(list,norm(item()));p.ingest(list,{...norm(item(2)),...change});
  assert.equal(p.select(list).length,0);
 }
});
test('寶石沿用頻道鎖、場次、月份、測試與清空排除；CSV 保留独立數字',()=>{
 const e=norm(item(2));assert.equal(p.jewelTotal(p.select([e],{channelLock:config,month:'2026-09'})),200);
 for(const filter of [{channelLock:lock.normalize()},{liveId:'other'},{month:'2026-08'}])assert.equal(p.jewelTotal(p.select([e],filter)),0);
 assert.equal(p.jewelTotal(p.select([{...e,recordMode:'test'}])),0);
 assert.equal(p.jewelTotal(p.select([e],{},()=>true)),0);
 assert.match(p.details([e]),/寶石合計/);assert.match(p.details([e]),/"200"/);
});
test('瀏覽器接收、連送更新及保存使用相同寶石規則',()=>{
 const s=fs.readFileSync(require.resolve('../admin.js'),'utf8'),storage=new Map();
 const ctx={RecordPolicy:p,URLSearchParams,location:{search:''},Date,Number,String,JSON,Map,connectionMode:'onesdk',
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},state:{settings:{...core.DEFAULT_SETTINGS},session:{},events:[]},
 observeSession(){},render(){},text(){},$(){return {}},isResetEvent:()=>false};
 vm.createContext(ctx);vm.runInContext(s.slice(s.indexOf('function sdkMoney('),s.indexOf('// Session selection')),ctx);
 vm.runInContext("const CACHE_KEY='cache';\n"+s.slice(s.indexOf('function sdkComments('),s.indexOf('function sdkMeta(')),ctx);
 ctx.sdkComments([item(1),item(3),item(3)]);
 assert.equal(ctx.state.events.length,1);assert.equal(ctx.state.events[0].jewelTotal,300);
 assert.equal(ctx.state.events[0].amountTwd,null);assert.equal(JSON.parse(storage.get('cache'))[0].jewelTotal,300);
});
test('Node 寶石純數字 TXT 可持久保存並重啟，SC 榜不受影響',async()=>{
 const fsp=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createRuntime}=require('../src/runtime');
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'yt-jewel-test-')),store={store:{channelLock:config}};
 let r=await createRuntime({dir,store},{services:[{url:'https://youtube.com/watch?v='+V,enabled:true}]});await r.subscribe('comments',[item(1),item(3),item(2)]);
 assert.equal(await fsp.readFile(path.join(dir,'output/current_jewel.txt'),'utf8'),'300\n');
 assert.doesNotMatch(await fsp.readFile(path.join(dir,'output/all_time_sc_top10.txt'),'utf8'),/Alice|300/);
 await r.close();r=await createRuntime({dir,store});await r.subscribe('comments',[item(3)]);
 assert.equal(await fsp.readFile(path.join(dir,'output/all_time_jewel.txt'),'utf8'),'300\n');assert.equal(r.events.length,1);
 const sc={service:'youtube',data:{id:'sc-test-flag',liveId:V,userId:'viewer',type:'superchat',price:5,unit:'TWD',timestamp:'2026-09-09T10:00:00Z'}};
 await r.subscribe('comments',[sc,{...sc,data:{...sc.data,isTest:true}}]);await r.close();
 r=await createRuntime({dir,store});assert.equal(r.events.find(e=>e.eventId==='sc-test-flag').explicitTest,true);await r.close();
});
