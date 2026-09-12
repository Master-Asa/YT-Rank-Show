'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),lock=require('../channel-lock');
const A='UC'+'a'.repeat(22),V='live0000001';
function fixture(savedSettings={}){
  const elements=new Map(),stored=new Map();let answer=true;
  function el(id){
    if(!elements.has(id))elements.set(id,{value:'',children:[],textContent:'',disabled:false,
      replaceChildren(...items){this.children=items;this.value=items[0]?.value||'';},append(item){this.children.push(item)}});
    return elements.get(id);
  }
  const state={events:[{service:'youtube',liveId:V,eventId:'preserved'}],settings:savedSettings,session:{}};
  const ctx={state,ChannelLock:lock,$:el,text:(e,v)=>{e.textContent=String(v)},liveServices:null,connectionMode:'onesdk',URLSearchParams,
    location:{search:''},confirm:()=>answer,
    currentChannelLock:()=>lock.normalize(state.settings.channelLock),channelAllowsLive:id=>lock.allows(state.settings.channelLock,id),
    updateObsUrls(){const params=new URLSearchParams();lock.writeQuery(params,state.settings.channelLock);el('obsScUrl').value='https://local/?'+params;},
    localStorage:{setItem:(k,v)=>stored.set(k,v)},render(){},applyServices(){},
    document:{activeElement:null,createElement:tag=>({tag,value:'',children:[],append(child){this.children.push(child)}})},
    window:{addEventListener(){}},MutationObserver:class{observe(){}}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../channel-admin.js'),'utf8'),ctx);
  return {ctx,state,el,stored,setAnswer(value){answer=value}};
}
test('首次頻道設定與逐場確認可保存，原事件不刪除，OBS URL 同步產生',async()=>{
  const f=fixture();assert.match(f.el('channelLockStatus').textContent,/先選擇要統計的實況主/);
  f.el('channelIdInput').value=A;await f.el('saveChannelLock').onclick();
  assert.equal(f.state.settings.channelLock.channelId,A);
  f.el('channelLiveInput').value='https://youtu.be/'+V;await f.el('confirmChannelLive').onclick();
  assert.equal(f.state.settings.channelLock.bindings[V].channelId,A);assert.equal(f.state.events.length,1);
  assert.equal(JSON.parse(f.stored.get('yt-rank-show-settings-v0.1')).channelLock.bindings[V].source,'manual-confirmation');
  assert.ok(f.el('obsScUrl').value.includes(V));assert.match(f.el('channelNotice').textContent,/已記住/);
});

test('重新建立頁面後回填已保存頻道與單場，無需再輸入或確認',()=>{
 const saved={channelLock:{...lock.bind({channelId:A},V),channelName:'實況主',channelSourceUrl:'https://www.youtube.com/@saved'}};
 for(let i=0;i<2;i++){
 const f=fixture(JSON.parse(JSON.stringify(saved)));
 assert.equal(f.el('publicChannelInput').value,'https://www.youtube.com/@saved');
 assert.equal(f.el('channelLiveChoice').value,V);
 assert.equal(f.el('channelLiveInput').value,'https://www.youtube.com/watch?v='+V);
 assert.match(f.el('channelLockStatus').textContent,/已加入 1 場/);
 assert.equal(f.stored.size,0);
 }
});
test('取消確認、無效 Channel ID 與儲存失败均不套用設定',async()=>{
  const f=fixture();f.el('channelIdInput').value='@someone';await f.el('saveChannelLock').onclick();
  assert.equal(f.state.settings.channelLock,undefined);
  f.el('channelIdInput').value=A;f.setAnswer(false);await f.el('saveChannelLock').onclick();
  assert.equal(f.state.settings.channelLock,undefined);
  f.setAnswer(true);f.ctx.localStorage.setItem=()=>{throw new Error('quota')};
  await f.el('saveChannelLock').onclick();assert.equal(f.state.settings.channelLock,undefined);
  assert.match(f.el('channelNotice').textContent,/quota/);assert.equal(f.el('saveChannelLock').disabled,false);
});

test('公開解析確認後保存頻道名稱、影片歸屬及證據',async()=>{
  const f=fixture(),url='https://youtu.be/'+V;
  f.ctx.PublicResolver=require('../public-resolver');
  const result={source:'youtube-public-metadata',requestUrl:'https://www.youtube.com/watch?v='+V,
    channelId:A,channelName:'外部實況主',liveId:V,resolvedAt:'2026-09-09T00:00:00Z'};
  assert.equal(await f.ctx.window.YTChannelAdmin.applyResolution(url,result,'lock'),true);
  assert.equal(f.state.settings.channelLock.channelName,'外部實況主');
  assert.equal(f.state.settings.channelLock.bindings[V].source,'youtube-public-metadata');
  assert.equal(f.state.events.length,1);
});
test('查詢直播歸屬發現外頻道時，不更換鎖定對象或新增場次',async()=>{
  const f=fixture();f.ctx.PublicResolver=require('../public-resolver');
  f.state.settings.channelLock=lock.normalize({channelId:A});
  const other='UC'+'b'.repeat(22),url='https://youtu.be/'+V;
  const result={source:'youtube-public-metadata',requestUrl:'https://www.youtube.com/watch?v='+V,
    channelId:other,channelName:'其他人',liveId:V,resolvedAt:'2026-09-09T00:00:00Z'};
  assert.equal(await f.ctx.window.YTChannelAdmin.applyResolution(url,result,'verify'),false);
  assert.equal(f.state.settings.channelLock.channelId,A);
  assert.equal(Object.keys(f.state.settings.channelLock.bindings).length,0);
  assert.match(f.el('channelNotice').textContent,/不是已鎖定/);
});
