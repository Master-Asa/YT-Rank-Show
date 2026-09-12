'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),contract=require('../public-resolver'),Lock=require('../channel-lock');
const R=require('../src/youtube-resolver'),{PassThrough}=require('node:stream'),{EventEmitter}=require('node:events');
const A='UC'+'a'.repeat(22);
test('影片只讀自身 player metadata；影片 ID／作者缺失或不符不採信',async()=>{
 const id='live0000001',html=details=>'<script>var ytInitialPlayerResponse = '+JSON.stringify({videoDetails:details})+';</script>',details={videoId:id,channelId:A,title:'Test video',author:'Test channel'};
 const r=await R.resolveVideoUrl('https://youtu.be/'+id,{downloadPage:async url=>{assert.equal(url,'https://www.youtube.com/watch?v='+id);return html(details);}});
 assert.equal(r.channelId,A);assert.equal(r.liveId,id);assert.equal(r.videoTitle,'Test video');
 for(const value of [{...details,videoId:'live0000002'},{...details,channelId:''},{...details,author:''}])await assert.rejects(R.resolveVideoUrl(id,{downloadPage:async()=>html(value)}));
 await assert.rejects(R.resolveVideoUrl(id,{downloadPage:async()=>'<script>var ytInitialData = '+JSON.stringify({recommendations:[details]})+';</script>'}));
});
test('使用系統 lookup 而非直接 DNS，保留公開位址驗證與可讀錯誤',async()=>{
 const addresses=await R.systemAddresses('www.youtube.com',async(host,options)=>{
  assert.equal(host,'www.youtube.com');assert.deepEqual(options,{family:4,all:true});return [{address:'142.250.1.1',family:4}];
 });assert.deepEqual(addresses,['142.250.1.1']);
 await assert.rejects(R.systemAddresses('www.youtube.com',async()=>{throw Error('queryA ECONNREFUSED');}),/Windows 無法解析/);
 const dns=require('node:dns').promises,oldLookup=dns.lookup,oldResolve=dns.resolve4;let calls=0;
 try{
  dns.resolve4=()=>{throw Error('Direct DNS must not be called');};
  dns.lookup=async()=>{calls++;return [{address:'127.0.0.1',family:4}];};
  await assert.rejects(R.download('https://www.youtube.com/@a',{get:()=>{throw Error('Private IP must not connect');}}),/公開網路/);assert.equal(calls,1);
 }finally{dns.lookup=oldLookup;dns.resolve4=oldResolve;}
});
const page=(id=A)=>'<script>var ytInitialData = '+JSON.stringify({metadata:{channelMetadataRenderer:{externalId:id,title:'測試 } \\" 頻道'}}})+';</script>';
test('限定頻道解析並拒絕缺失／錯誤 metadata，不執行網頁',async()=>{
 let seen='';const result=await R.resolvePublicUrl('https://www.youtube.com/@%E6%B8%AC%E8%A9%A6?tracking=private',{downloadPage:async url=>{seen=url;return page();}});
 assert.equal(seen,'https://www.youtube.com/@%E6%B8%AC%E8%A9%A6');assert.equal(result.channelId,A);
 for(const value of ['https://evil.test/@x','https://www.youtube.com:444/@x','https://youtu.be/live0000001'])await assert.rejects(R.resolvePublicUrl(value,{downloadPage:()=>{throw Error('should not request');}}));
 await assert.rejects(R.resolvePublicUrl('@a',{downloadPage:async()=>'<script>throw new Error()</script>'}));
 await assert.rejects(R.resolvePublicUrl('UC'+'b'.repeat(22),{downloadPage:async()=>page()}),/不符/);
});
test('DNS 只准公開位址，固定目的 IP；不帶 Cookie、授權、轉介標頭',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','::1','224.0.0.1','192.0.2.1'])assert.equal(R.publicIPv4(ip),false);
 let called=0;
 await assert.rejects(R.download('https://www.youtube.com/@a',{resolve4:async()=>['127.0.0.1'],get:()=>called++}),/公開/);assert.equal(called,0);
 const html=await R.download('https://www.youtube.com/@a',{resolve4:async()=>['142.250.1.1'],get:(url,options,cb)=>{
  called++;assert.equal(url.hostname,'www.youtube.com');assert.deepEqual(Object.keys(options.headers).sort(),['Accept','Accept-Encoding','User-Agent']);
  options.lookup(url.hostname,{},(error,ip)=>{assert.equal(error,null);assert.equal(ip,'142.250.1.1');});
  const req=new EventEmitter();req.destroy=()=>{};process.nextTick(()=>{const res=new PassThrough();res.statusCode=200;res.headers={'content-type':'text/html'};cb(res);res.end(page());});return req;
 }});assert.equal(html,page());assert.equal(called,1);
});
test('重新導向／壓縮／過大回應與逾時均失敗，不發第二次請求',async()=>{
 for(const mode of ['redirect','compressed','large']){
  let calls=0;await assert.rejects(R.download('https://www.youtube.com/@a',{resolve4:async()=>['142.250.1.1'],maxBytes:10,get:(u,o,cb)=>{
   calls++;const req=new EventEmitter();req.destroy=()=>{};process.nextTick(()=>{const res=new PassThrough();res.statusCode=mode==='redirect'?302:200;res.headers={'content-type':'text/html',...(mode==='compressed'?{'content-encoding':'gzip'}:{})};cb(res);res.end('x'.repeat(20));});return req;
  }}));assert.equal(calls,1);
 }
 await assert.rejects(R.download('https://www.youtube.com/@a',{timeout:10,resolve4:()=>new Promise(()=>{})}),/逾時/);
});
test('本機查詢必須有來源、工作階段與同意；限制額外資料與頻率',async()=>{
 let calls=0;const {createResolverServer}=require('../scripts/resolver-server');const server=createResolverServer({resolveChannel:async value=>{calls++;assert.equal(value,'@test');return {channelId:A};}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,origin='http://127.0.0.1:11180';
 try{
  const post=(headers,body)=>fetch(base+'/resolve',{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await post({'Content-Type':'application/json'},{url:'@test',consent:true})).status,403);
  const session=await(await fetch(base+'/session',{headers:{Origin:origin}})).json(),headers={Origin:origin,'Content-Type':'application/json','X-YT-Session':session.credential};
  assert.equal(calls,0);assert.equal((await post(headers,{url:'@test'})).status,400);
  assert.equal((await post(headers,{url:'@test',consent:true,events:[]})).status,400);assert.equal(calls,0);
  assert.equal((await post(headers,{url:'@test',consent:true})).status,200);assert.equal(calls,1);
  assert.equal((await post(headers,{url:'@test',consent:true})).status,429);assert.equal(calls,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('離線 URL 剖析保留舊證據的相容性，不連線',()=>{
 const id='UC'+'a'.repeat(22),v='live0000001';
 assert.equal(contract.input(id).channelId,id);
 assert.equal(contract.input('https://youtu.be/'+v).videoId,v);
 assert.equal(Lock.parseChannel('https://www.youtube.com/channel/'+id),id);
 for(const url of ['https://youtube.com.evil/@a','https://127.0.0.1/@a','file:///a','https://user:pass@youtube.com/@a'])assert.throws(()=>contract.input(url));
});
test('已存的線上解析證據仍保留，新版只移除查詢而不刪舊設定',()=>{
 const id='UC'+'a'.repeat(22),v='live0000001';let lock=Lock.bind({channelId:id,channelName:'原頻道'},v);lock.bindings[v].source='youtube-public-metadata';
 lock=Lock.normalize(JSON.parse(JSON.stringify(lock)));assert.equal(lock.channelName,'原頻道');assert.equal(lock.bindings[v].source,'youtube-public-metadata');
});
