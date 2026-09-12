'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const Policy=require('../record-policy'),{createRuntime}=require('../src/runtime'),createCache=require('../font-face-cache');
test('indexed ingestion matches legacy duplicates, conflicts and jewel updates without mutating old rows',()=>{
 const base={service:'youtube',liveId:'live0000001',eventId:'x',userId:'u',timestamp:'2026-09-12T00:00:00Z',eventType:'jewel',jewelUnit:5,jewelGiftCount:1,jewelTotal:5,jewelGiftId:'g',recordMode:'production'};
 for(const inputs of [[base,{...base,jewelGiftCount:3},{...base,explicitTest:true}],[{...base,eventType:'superchat',originalAmount:10},{...base,eventType:'superchat',originalAmount:20}],[base,base]]){
  const original=[{...base,eventId:'untouched'}],before=JSON.stringify(original),expected=JSON.parse(before);for(const event of inputs)Policy.ingest(expected,{...event});const result=Policy.ingestBatch(original,inputs);assert.deepEqual(result.events,expected);assert.equal(JSON.stringify(original),before);assert.equal(result.events[0],original[0]);
 }
});
test('delta poll updates only changed rows and falls back on stale revisions; style saves retain records',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yt-delta-')),r=await createRuntime({dataDir:dir});
 try{const first=r.view(),item={service:'youtube',data:{id:'x',userId:'u',type:'superchat',liveId:'live0000001',timestamp:new Date().toISOString(),price:10,unit:'TWD'}};
 await r.subscribe('comments',[item]);let value=(await r.request({method:'POST',body:{action:'poll',dataRevision:first.dataRevision,acceptDelta:true}})).response;assert.equal(value.events,undefined);assert.equal(value.eventDelta.rows.length,1);assert.equal(value.eventDelta.count,1);const revision=value.dataRevision;
 await r.request({method:'POST',body:{action:'styles',kind:'sc',period:'monthly',value:{enabled:true},expectedRevision:r.snapshot().styleRevision}});value=(await r.request({method:'POST',body:{action:'poll',dataRevision:revision,acceptDelta:true}})).response;assert.deepEqual(value.eventDelta.rows,[]);assert.equal(value.notModifiedRecords,true);
 value=(await r.request({method:'POST',body:{action:'poll',dataRevision:first.dataRevision,acceptDelta:true}})).response;assert.equal(value.events.length,1);
 const a=r.close(),b=r.close();assert.equal(a,b);await Promise.all([a,b]);
 }finally{await r.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
test('preview face cache evicts old faces, protects selection, bounds concurrency and removes superseded faces',async()=>{
 const removed=[],cache=createCache({add:()=>{},remove:f=>removed.push(f.family),maxEntries:3,maxBytes:30,concurrency:2});cache.pin(['selected']);let active=0,peak=0;
 const get=(key,name=key)=>cache.get(key,name,async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;return {face:{family:key},bytes:10};});
 await get('selected');await Promise.all(Array.from({length:12},(_,i)=>get('f'+i)));assert.ok(cache.stats().entries<=3);assert.ok(cache.stats().bytes<=30);assert.ok(peak<=2);assert.ok(!removed.includes('selected'));
 await get('selected-new','selected');assert.ok(removed.includes('selected'));assert.ok(cache.stats().entries<=3);cache.pin([]);
});
