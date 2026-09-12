'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const Theme=require('../style-theme'),{createStateStore}=require('../src/state-store'),{extractCollection}=require('../src/font-collection');
const data='data:font/ttf;base64,AAEAAA==';
test('共用與期間外觀獨立；恢復共用不影響別種榜',()=>{
 let map=Theme.normalizeMap({sc:{enabled:true,font:'Arial'},gift:{enabled:true,font:'Other'}});
 map=Theme.update(map,'sc',{enabled:true,font:'Courier New',titles:{monthly:'月榜'}},'monthly');
 assert.equal(Theme.select(map,'sc','current').font,'Arial');assert.equal(Theme.select(map,'sc','monthly').font,'Courier New');
 map=Theme.update(map,'sc',{enabled:true,font:'Shared'});
 assert.equal(Theme.select(map,'sc','monthly').font,'Courier New');assert.equal(Theme.select(map,'sc','all_time').font,'Shared');
 map=Theme.update(map,'sc',{enabled:true,font:'Final'},'monthly',true);assert.equal(map['sc:monthly'],undefined);assert.equal(Theme.select(map,'sc','monthly').font,'Final');assert.equal(map.gift.font,'Other');
 assert.throws(()=>Theme.update(map,'sc',{},'bad'));assert.throws(()=>Theme.select({'sc:monthly':{fontAssets:{A:'font-ref:f0'}}},'sc','monthly'));
});
test('相同字型跨榜與期間去重；舊格式移入與 CSS 保留',()=>{
 const style={enabled:true,font:'A',fontAssets:{A:data}};
 const map=Theme.normalizeMap({sc:style,'sc:monthly':style,gift:style});
 assert.equal(Object.keys(map._fonts).length,1);assert.match(map.sc.fontAssets.A,/^font-ref:/);assert.deepEqual(Theme.normalizeMap(map),map);
 assert.match(Theme.css(Theme.select(map,'sc','monthly')),/data:font/);
 assert.throws(()=>Theme.normalizeMap({sc:{font:'A',fontAssets:{A:'font-ref:f0'}},_fonts:{f0:'https://evil.example/font.ttf'}}));
});
test('字型獨立物件保存、備份完整、重啟還原、變更外觀不重寫字型',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yt-font-store-'));try{
 const store=createStateStore(dir),themes=Theme.normalizeMap({sc:{enabled:true,font:'A',fontAssets:{A:data}},'sc:monthly':{enabled:true,font:'A',fontAssets:{A:data}}}),value={schemaVersion:3,events:[],settings:{},themes,revision:1};
 await store.save(value);let files=await fs.readdir(path.join(dir,'objects'));const fonts=files.filter(f=>f.startsWith('font-'));assert.equal(fonts.length,1);const fontFile=path.join(dir,'objects',fonts[0]),before=(await fs.stat(fontFile)).mtimeMs;
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'state.json'))),raw=await fs.readFile(path.join(dir,'objects',manifest.themes),'utf8');assert.ok(!raw.includes('data:font'));assert.deepEqual((await createStateStore(dir).load()).themes,themes);
 value.themes=Theme.update(themes,'sc',{...Theme.select(themes,'sc','current'),accent:'#ff0000'});await store.save(value);assert.equal((await fs.stat(fontFile)).mtimeMs,before);
 const b=await store.backup(value),backup=JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(dir,'backups',b.name))));assert.equal(backup.themes._fonts.f0,data);assert.ok((await store.usage()).categories.appearance>0);
 }finally{await fs.rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
test('TTC 拒絕截斷、錯誤範圍與過量字面',()=>{assert.throws(()=>extractCollection(Buffer.from('ttcf'),'A'));const b=Buffer.alloc(16);b.write('ttcf');b.writeUInt32BE(257,8);assert.throws(()=>extractCollection(b,'A'));b.writeUInt32BE(1,8);b.writeUInt32BE(999,12);assert.throws(()=>extractCollection(b,'A'));});
