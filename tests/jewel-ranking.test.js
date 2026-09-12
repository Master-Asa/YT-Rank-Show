'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),p=require('../record-policy'),core=require('../src/core'),lock=require('../channel-lock'),output=require('../rank-output');
const channelLock=lock.bind({channelId:'UC'+'a'.repeat(22)},'live0000001');
const make=(id,user,count,time='2026-09-10T10:00:00Z')=>core.normalizeEvent({service:'youtube',data:{id,liveId:'live0000001',userId:user,name:user,timestamp:time,giftType:'jewel',jewels:100,giftCount:count,giftId:id}}, {},core.DEFAULT_SETTINGS);
test('寶石排行按 userId 合併、分期間並沿用隔離規則',()=>{
 const events=[make('a','A',2),make('b','A',3),make('c','B',4),make('d','A',9,'2026-08-01T00:00:00Z'),{...make('x','X',99),recordMode:'test'},{...make('y','Y',99),liveId:'other'}];
 const selected=p.select(events,{channelLock,month:'2026-09'});
 assert.deepEqual(p.rank(selected,'jewel').map(r=>[r.userId,r.value]),[['A',500],['B',400]]);
 assert.deepEqual(p.rank(selected,'sc'),[]);assert.deepEqual(p.rank(selected,'gift'),[]);
 const s=output.snapshot({events,settings:core.DEFAULT_SETTINGS,session:{},channelLock,now:'2026-09-10T12:00:00Z'},p);
 assert.equal(s.outputs['current-jewel-3'],'【本場 寶石 排行榜】');
 assert.match(s.outputs['monthly-jewel-3'],/寶石 排行榜/);
 assert.equal(s.views['monthly-jewel-3'].rows[0].value,'500 顆');
 assert.equal(s.views['all_time-jewel-3'].rows[0].value,'1,400 顆');
 assert.equal(s.outputs['monthly-jewel'],'900','legacy number URL remains supported');
});
