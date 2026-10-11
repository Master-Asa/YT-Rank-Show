'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const Currency=require('../currency'),core=require('../src/core'),Policy=require('../record-policy'),Lock=require('../channel-lock');
const {createRuntime,cleanSettings}=require('../src/runtime');
const settings={...core.DEFAULT_SETTINGS,rates:{...Currency.defaultRates}};
const channel='UC'+'a'.repeat(22),live='live0000001',lock=Lock.bind({channelId:channel},live);
const item=(id,extra={})=>({service:'youtube',data:{id,liveId:live,userId:id,name:id,type:'superchat',timestamp:new Date().toISOString(),price:10,unit:'MYR',...extra}});

test('15 種幣別與所有別名，Node / 瀏覽器規則一致，正反金額位置皆可辨識',async()=>{
  const context={};vm.createContext(context);vm.runInContext(await fs.readFile(require.resolve('../currency'),'utf8'),context);
  assert.equal(Object.keys(Currency.defaultRates).length,15);
  const aliases={TWD:['TWD','NTD','NT$','NT $'],USD:['USD','US$'],JPY:['JPY','¥','￥'],HKD:['HKD','HK$'],CNY:['CNY','RMB','CN¥'],EUR:['EUR','€'],KRW:['KRW','₩'],MYR:['MYR','RM'],SGD:['SGD','S$','SG$'],THB:['THB','฿'],IDR:['IDR','Rp'],PHP:['PHP','₱'],AUD:['AUD','A$','AU$'],CAD:['CAD','C$','CA$'],GBP:['GBP','£']};
  for(const [code,tokens] of Object.entries(aliases))for(const token of tokens){
    assert.equal(Currency.normalizeUnit(token.toLowerCase()).currency,code);
    for(const text of [token+' 1,234.50','1,234.50 '+token]){
      const parsed=core.parsePaidText(text);assert.equal(parsed.currency,code,text);assert.equal(parsed.amount,1234.5,text);
      assert.equal(JSON.stringify(parsed),JSON.stringify(context.RankCurrency.parsePaidText(text)),text);
      assert.equal(core.currencyDetails({paidText:text},settings).amountTwd,Math.round(1234.5*settings.rates[code]*100)/100);
    }
  }
  assert.equal(core.parsePaidText('RMB 10').currency,'CNY');assert.equal(core.parsePaidText('RM\u00a010.00').currency,'MYR');
});

test('原七種預設值保留，新增八種各用自己的匯率，不把 Rp 視為台幣',()=>{
  assert.deepEqual(Object.keys(Currency.defaultRates).slice(0,7),['TWD','USD','JPY','HKD','CNY','EUR','KRW']);
  for(const code of Currency.addedCurrencies){const rate=settings.rates[code];const e=core.normalizeEvent(item(code,{price:100,unit:code}),{},settings);assert.equal(e.amountTwd,Math.round(100*rate*100)/100);assert.equal(e.normalizedCurrency,code);assert.equal(e.originalAmount,100);}
  assert.equal(core.currencyDetails({paidText:'Rp 100,000'},settings).amountTwd,173);
});

test('明確代碼優先，裸 $ 沿用設定，未知幣別及不完整數字不誤算',()=>{
  assert.equal(core.currencyDetails({price:10,unit:'MYR',paidText:'$10'},settings).normalizedCurrency,'MYR');
  assert.equal(core.currencyDetails({price:10,unit:'$',paidText:'SGD 10'},settings).normalizedCurrency,'SGD');
  assert.equal(core.currencyDetails({price:10,unit:'¥',paidText:'CNY 10'},settings).normalizedCurrency,'CNY');
  assert.equal(core.currencyDetails({paidText:'$10'},settings).normalizedCurrency,'TWD');
  assert.equal(core.currencyDetails({paidText:'$10'},{...settings,dollarCurrency:'USD'}).amountTwd,315);
  assert.equal(core.currencyDetails({price:10,unit:'XYZ',paidText:'$10'},settings).amountTwd,null);
  for(const text of ['RM 1,5','RM 1.000,50','Rp 10.000','RM 10oops','RMBogus 10','10','MYR 10 USD','RM 10.20.30'])assert.equal(core.currencyDetails({paidText:text},settings).amountTwd,null,text);
  assert.equal(core.currencyDetails({price:10000,paidText:'Rp 10.000'},settings).amountTwd,17.3);
  for(const price of [null,'',true,{},Infinity,NaN,-10,0])assert.equal(core.currencyDetails({price,unit:'MYR'},settings).amountTwd,null);
  assert.equal(core.currencyDetails({price:10,unit:'MYR'},{...settings,rates:{MYR:0}}).amountTwd,null);
  assert.equal(core.currencyDetails({price:10,unit:'MYR'},{...settings,rates:{MYR:Infinity}}).amountTwd,null);
});

test('設定可保存所有新幣別，自訂舊匯率不覆蓋，台幣固定 1，無效匯率拒絕',()=>{
  const old={...settings,rates:{TWD:1,USD:30,JPY:0.2}};
  const merged=cleanSettings({},old);assert.equal(merged.rates.USD,30);assert.equal(merged.rates.MYR,7.5415);
  const value=cleanSettings({rates:{MYR:8,IDR:0.002,TWD:2}},merged);assert.equal(value.rates.MYR,8);assert.equal(value.rates.IDR,0.002);assert.equal(value.rates.TWD,1);
  for(const invalid of [0,-1,'',Infinity,'no'])assert.throws(()=>cleanSettings({rates:{MYR:invalid}}),/無效匯率/);
  assert.throws(()=>cleanSettings({dollarCurrency:'SGD'}),/單獨/);
});

test('管理頁接收與核心對十五幣別的金額、來源判斷完全一致',async()=>{
  const source=await fs.readFile(require.resolve('../admin'),'utf8'),context={RankCurrency:Currency,state:{settings},localStorage:{},CACHE_KEY:'test'};vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function sdkMoney('),source.indexOf('function sdkEvent(')),context);
  for(const code of Object.keys(settings.rates))for(const d of [{price:123.5,unit:code},{paidText:code+' 123.50'},{amount:123.5,currency:code}])assert.equal(JSON.stringify(context.sdkMoney(d)),JSON.stringify(core.currencyDetails(d,settings)));
});

test('重新換算保留識別、原始資訊與所有不計入限制，不改動會員／寶石',()=>{
  const e=core.normalizeEvent(item('same',{price:10,unit:'MYR'}),{},settings),excluded={...e,excluded:true,recordMode:'test',auditReasons:['保留原因']};
  const newer={...settings,rates:{...settings.rates,MYR:8}},next=Currency.revalue(excluded,newer);
  assert.equal(next.eventId,excluded.eventId);assert.equal(next.originalCurrency,'MYR');assert.equal(next.originalAmount,10);assert.equal(next.amountTwd,80);
  assert.equal(next.excluded,true);assert.equal(next.recordMode,'test');assert.deepEqual(next.auditReasons,excluded.auditReasons);assert.equal(Policy.eligible(next,undefined,lock),false);
  const gift={...e,eventType:'sponsorgift',giftCount:5},jewel={...e,eventType:'jewel',jewelTotal:200};assert.equal(Currency.revalue(gift,newer),gift);assert.equal(Currency.revalue(jewel,newer),jewel);
  assert.equal(Currency.recalculate([next],newer).changed,false);
});

test('升級舊待核對幣別先備份、保留事件與自訂匯率，重啟不重複換算或加入',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yt-currency-upgrade-'));
  const {createStateStore}=require('../src/state-store'),storage=createStateStore(dir);
  const original=core.normalizeEvent(item('old',{price:10,unit:'MYR'}),{},settings);
  const pending={...original,normalizedCurrency:null,amountTwd:null,exchangeRate:null,currencyDecisionSource:'unknown-unit'};
  const textOnly={...pending,eventId:'text-only',userId:'text-only',originalCurrency:'',originalAmount:null,originalPaidText:'RM 20.00'};
  const old={schemaVersion:3,events:[pending,textOnly,{...pending,eventId:'excluded',excluded:true},{...pending,eventId:'test',recordMode:'test'},{...pending,eventId:'reset'},{...pending,eventId:'other',liveId:'live0000002'},{...pending,eventId:'unsupported',originalCurrency:'XYZ',originalPaidText:'$10'}],settings:{channelLock:lock,rates:{TWD:1,USD:30}},reset:{at:0,ids:[]},themes:{},writeToken:'a'.repeat(64),revision:1};
  // Use a real reset timestamp/ID to verify the repaired event remains excluded.
  old.reset={at:Date.now()-1000,ids:['reset']};await storage.save(old);let runtime;
  try{
    runtime=await createRuntime({dataDir:dir});const result=runtime.view();
    assert.equal(result.events.length,7);assert.equal(result.settings.rates.USD,30);assert.equal(result.events[0].eventId,'old');assert.equal(result.events[0].amountTwd,75.42);assert.equal(result.events[1].originalAmount,20);assert.equal(result.events[1].amountTwd,150.83);
    assert.equal(result.events[1].originalCurrency,'');assert.equal(result.events[2].excluded,true);assert.equal(result.events[3].recordMode,'test');assert.equal(result.events[6].amountTwd,null);
    const ranked=Policy.rank(result.events.filter(e=>Policy.eligible(e,x=>result.reset.ids.includes(x.eventId),lock)),'sc');assert.equal(ranked.length,2);
    const list=await storage.usage();assert.ok(list.backups.some(x=>x.name.startsWith('repair-')));const revision=result.revision;await runtime.close();
    runtime=await createRuntime({dataDir:dir});assert.equal(runtime.view().revision,revision);assert.equal(runtime.events.length,7);assert.equal(runtime.events[0].amountTwd,75.42);
  }finally{await runtime?.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('改匯率與手動重算即時更新排行榜、TXT 與匯出；去重及排除維持',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yt-currency-runtime-'));let runtime;
  try{
    const myr=item('myr');runtime=await createRuntime({dataDir:dir,store:{store:{channelLock:lock}}},{services:[{url:'https://youtube.com/watch?v='+live}],comments:[myr,item('idr',{price:100000,unit:'IDR'}),item('excluded')]});
    await runtime.request({method:'PUT',body:{action:'exclude',eventId:'excluded',liveId:live,excluded:true}});
    const result=await runtime.request({method:'PUT',body:{rates:{MYR:8,IDR:0.002}}});assert.equal(result.code,200);assert.equal(runtime.events[0].amountTwd,80);assert.equal(runtime.events[1].amountTwd,200);assert.equal(runtime.events[2].excluded,true);
    assert.match(runtime.snapshot().outputs['all_time-sc-10'],/NT\$200/);assert.match(await fs.readFile(path.join(dir,'output/all_time_sc_top10.txt'),'utf8'),/NT\$80/);assert.match(Policy.details(runtime.events),/MYR/);
    await runtime.subscribe('comments',[myr]);assert.equal(runtime.events.length,3);assert.equal((await runtime.request({method:'POST',body:{}})).code,200);assert.equal(runtime.events[0].amountTwd,80);
    const bad=await runtime.request({method:'PUT',body:{rates:{MYR:0}}});assert.equal(bad.code,400);assert.equal(runtime.view().settings.rates.MYR,8);
    await runtime.close();runtime=await createRuntime({dataDir:dir});assert.equal(runtime.events[1].amountTwd,200);assert.equal(runtime.view().settings.rates.MYR,8);
  }finally{await runtime?.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('重新換算備份失敗時，既有設定與金額不套用',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yt-currency-failure-'));let runtime;
  try{
    runtime=await createRuntime({dataDir:dir,store:{store:{channelLock:lock}}},{comments:[item('unchanged')]});
    await fs.writeFile(path.join(dir,'backups'),'isolated blocker');
    const before=runtime.view(),result=await runtime.request({method:'PUT',body:{rates:{MYR:8}}});assert.equal(result.code,400);assert.deepEqual(runtime.events,before.events);assert.deepEqual(runtime.view().settings,before.settings);
  }finally{await runtime?.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('新共用幣別模組列入安裝白名單並在 admin 之前載入，不帶入暫停介面',async()=>{
  const manifest=require('../scripts/release-files.json'),html=await fs.readFile(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(manifest.install.includes('currency.js'));assert.ok(manifest.install.includes('docs/CURRENCIES.md'));assert.ok(html.indexOf('src="currency.js"')<html.indexOf('src="admin.js"'));
  assert.ok(!manifest.install.some(x=>x.startsWith('product-workspace')));assert.doesNotMatch(html,/product-workspace/);
});

test('歷史匯入對十五種幣別及 Super Sticker 使用相同換算，不另連線抓匯率',()=>{
  const H=require('../src/history-import'),time='2026-10-10T10:00:00Z';
  const rows=Object.keys(settings.rates).map(code=>item(code,{timestamp:time,price:100000,unit:code,type:'supersticker'}));
  const result=H.collect(rows,settings,H.dateRange('2026-10-01','2026-10-31'));
  assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].events.length,15);
  for(const event of result.sessions[0].events){assert.equal(event.eventType,'supersticker');assert.equal(event.amountTwd,Math.round(100000*settings.rates[event.normalizedCurrency]*100)/100);}
});

test('純文字來源的重新換算保留 paid-text 證據來源，裸 $ 可依設定重算',async()=>{
  const e=core.normalizeEvent(item('text',{price:undefined,unit:undefined,paidText:'$10'}),{},settings);
  const result=Currency.revalue(e,{...settings,dollarCurrency:'USD'});assert.equal(result.amountTwd,315);assert.equal(result.currencyDecisionSource,'paid-text-single-dollar-setting');
  const source=await fs.readFile(require.resolve('../admin'),'utf8'),storage=new Map(),context={RankCurrency:Currency,state:{settings:{...settings,rates:{...settings.rates,MYR:8}},events:[core.normalizeEvent(item('local'),{},settings)]},localStorage:{setItem:(key,value)=>storage.set(key,value)},CACHE_KEY:'isolated'};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function sdkMoney('),source.indexOf('function sdkEvent(')),context);
  context.recalculateLocalMoney();assert.equal(context.state.events[0].amountTwd,80);assert.equal(JSON.parse(storage.get('isolated'))[0].amountTwd,80);
  const unchanged=context.state.events;context.recalculateLocalMoney();assert.equal(context.state.events,unchanged);
});
