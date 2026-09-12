'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createRuntime}=require('../src/runtime'),{createResolverServer,allowedOrigin}=require('../scripts/resolver-server'),Lock=require('../channel-lock');
const A='UC'+'a'.repeat(22),V='live0000001',Other='live0000002',lock=Lock.bind({channelId:A,channelName:'本機測試'},V);
test('同一份資料不能有第二個背景寫入者；關閉後可再啟動',async()=>{
 const {r,dir}=await create();await assert.rejects(createRuntime({dir}),/同一份資料|另一份插件/);await r.close();const restored=await createRuntime({dir});await r.close();assert.ok((await fs.readdir(path.join(dir,'data'))).includes('writer.lock'));await restored.close();
});
const item=(type,id,extra={})=>({service:'youtube',data:{id,type,userId:id,name:id,liveId:V,timestamp:new Date().toISOString(),price:30,unit:'TWD',...extra}});
async function create(initial={}){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yt-background-'));return {dir,r:await createRuntime({dir,store:{store:{channelLock:lock}}},initial)};}
test('背景接受真實 OneComme initial / comments envelope；關閉網頁不影響三種榜',async()=>{
 const {dir,r}=await create({services:[{id:'s',url:'https://youtube.com/watch?v='+V,enabled:true}],comments:[item('superchat','SC')]});
 try{await r.subscribe('comments',{comments:[item('sponsorgift','giver',{comment:'贈送了 5 個會員'}),item('giftreceived','receiver',{giftCount:1}),item('jewel','jewel',{jewels:100,giftCount:3}),item('superchat','other',{liveId:Other,price:999})]});
 const s=r.snapshot();assert.match(s.outputs['current-sc-10'],/NT\$30/);assert.doesNotMatch(s.outputs['all_time-sc-10'],/999/);assert.match(s.outputs['monthly-gift-10'],/5個/);assert.doesNotMatch(s.outputs['monthly-gift-10'],/receiver/);assert.match(s.outputs['monthly-jewel-10'],/300 顆/);
 await r.subscribe('services',[]);assert.equal(r.snapshot().outputs['current-sc-10'],'【本場 SC 排行榜】');assert.match(r.snapshot().outputs['monthly-sc-10'],/NT\$30/);
 const token=r.readToken;await r.close();const restored=await createRuntime({dir});assert.equal(restored.events.length,5);assert.equal(restored.readToken,token);assert.match(restored.snapshot().outputs['all_time-gift-10'],/5個/);await restored.close();
 }finally{await r.close();}
});
test('並行寫入、重複事件、reset 均持久保存',async()=>{
 const {dir,r}=await create();const events=Array.from({length:20},(_,i)=>item('superchat','u'+i));await Promise.all(events.map(e=>r.subscribe('comments',{comments:[e,e]})));assert.equal(r.events.length,20);
 assert.equal((await r.request({method:'POST',body:{action:'reset'}})).code,200);assert.doesNotMatch(r.snapshot().outputs['all_time-sc-10'],/NT\$/);await r.close();const restored=await createRuntime({dir});assert.equal(restored.events.length,20);assert.doesNotMatch(restored.snapshot().outputs['all_time-sc-10'],/NT\$/);await restored.close();
});
test('舊資料一次移入保留 token／外觀／原始重複列，先備份；第二次不覆寫',async()=>{
 const {r,dir}=await create();const raw=require('../src/core').normalizeEvent(item('sponsorgift','old',{giftCount:5}));
 const result=await r.request({method:'POST',body:{action:'migrate',source:'http://local',events:[raw,{...raw,auditReasons:['會員解析修復：相同事件副本，不重複計數']}],settings:{channelLock:lock},reset:{},themes:{gift:{enabled:true,titles:{monthly:'龍柱榜'},parts:{name:{color:'#ff0000'}}}},writeToken:'a'.repeat(64)}});
 assert.equal(result.code,200);assert.equal(r.events.length,2);assert.match(r.snapshot().outputs['monthly-gift-10'],/龍柱榜/);assert.match(r.snapshot().outputs['monthly-gift-10'],/5個/);assert.equal(r.readToken,require('node:crypto').createHash('sha256').update('a'.repeat(64)).digest('hex'));
 assert.ok((await fs.readdir(path.join(dir,'data'))).some(x=>x.startsWith('before-migration-')));
 await r.request({method:'POST',body:{action:'migrate',events:[],settings:{}}});assert.equal(r.events.length,2);
 const revision=r.snapshot().styleRevision;assert.equal((await r.request({method:'POST',body:{action:'styles',kind:'gift',expectedRevision:'stale',value:{}}})).code,400);
 assert.equal(r.snapshot().styleRevision,revision);await r.close();
});
test('本機 API 拒絕別台區網來源及無工作階段憑證；OBS 唯讀 token，禁止頁面覆寫',async()=>{
 const {r}=await create(),server=createResolverServer({runtime:r,fonts:async()=>['Test Font'],addresses:new Set(['127.0.0.1','localhost'])});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,origin='http://127.0.0.1:11180';
 try{
 assert.equal(allowedOrigin('http://192.168.10.20:11180',new Set(['127.0.0.1'])),false);
 for(const route of ['/session','/api','/fonts'])assert.equal((await fetch(base+route,{headers:{Origin:'http://192.168.10.20:11180'}})).status,403);
 assert.equal((await fetch(base+'/fonts',{headers:{Origin:origin}})).status,403);
 const session=await(await fetch(base+'/session',{headers:{Origin:origin}})).json(),headers={Origin:origin,'X-YT-Session':session.credential,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/fonts',{headers})).status,200);assert.equal((await fetch(base+'/api',{headers})).status,200);
 assert.equal((await fetch(base+'/obs/output/'+r.readToken,{headers:{Origin:origin}})).status,200);
 assert.equal((await fetch(base+'/obs/publish',{method:'POST',headers,body:'{}'})).status,409);
 assert.equal((await fetch(base+'/resolve',{method:'POST',headers,body:'{}'})).status,400);
 const data=await(await fetch(base+'/api',{headers})).json();assert.equal(data.settings.channelLock.channelId,A);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await r.close();}
});
test('無效網址不聯外；Host REST 不提供私有資料',async()=>{
 let called=false;await assert.rejects(require('../src/youtube-resolver').resolvePublicUrl('https://127.0.0.1/',{downloadPage:()=>{called=true;}}));assert.equal(called,false);
 const response=await require('../plugin').request({method:'GET'});assert.equal(response.response.events,undefined);assert.equal(response.response.localManagementOnly,true);
});
