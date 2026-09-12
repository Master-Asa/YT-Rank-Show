'use strict';
// Synthetic, read-only policy benchmark. Never loads a user data directory.
const {performance}=require('node:perf_hooks'),path=require('node:path');
const root=process.env.YT_BENCH_ROOT||path.resolve(__dirname,'..'),Policy=require(path.join(root,'record-policy')),Lock=require(path.join(root,'channel-lock')),Output=require(path.join(root,'rank-output'));
const count=Number(process.argv[2]||10000),lock=Lock.bind({channelId:'UC'+'a'.repeat(22)},'live0000001'),now='2026-09-12T00:00:00Z';
const events=Array.from({length:count},(_,i)=>({service:'youtube',liveId:'live0000001',eventId:'synthetic-'+i,userId:'user-'+i%1000,displayName:'Synthetic '+i%1000,eventType:'superchat',timestamp:'2026-09-'+String(1+i%11).padStart(2,'0')+'T00:00:00Z',originalAmount:10,normalizedCurrency:'TWD',exchangeRate:1,amountTwd:10}));
const start=performance.now();const result=Output.snapshot({events,settings:{timezone:'Asia/Taipei'},session:{service:'youtube',liveId:'live0000001'},channelLock:lock,now},Policy);const snapshotMs=performance.now()-start;
const batchStart=performance.now();let next=events.slice();if(Policy.ingestBatch)next=Policy.ingestBatch(events,Array.from({length:100},(_,i)=>({...events[0],eventId:'new-'+i}))).events;else for(let i=0;i<100;i++)Policy.ingest(next,{...events[0],eventId:'new-'+i});
console.log(JSON.stringify({records:count,snapshotMs:Math.round(snapshotMs),ingest100Ms:Math.round(performance.now()-batchStart),rssMiB:Math.round(process.memoryUsage().rss/1048576),resultKeys:Object.keys(result.outputs).length,afterIngest:next.length}));
