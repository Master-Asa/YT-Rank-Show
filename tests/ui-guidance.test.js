'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {explain}=require('../ui-guidance'),p=require('../record-policy'),lock=require('../channel-lock');
const V='live0000001',A='UC'+'a'.repeat(22),config=lock.bind({channelId:A},V);
const e={eventId:'one',eventIdSource:'comment-id',service:'youtube',liveId:V,userId:'u',eventType:'superchat',timestamp:'2026-09-01T00:00:00Z',createdAt:'2026-09-01T00:00:01Z',originalAmount:100,normalizedCurrency:'TWD',exchangeRate:1,amountTwd:100};
const opts={kind:'sc',period:'monthly',session:{},channelLock:config,now:'2026-09-10T00:00:00Z'};
test('結束本場不會讓有效月榜或歷史消失',()=>{
 assert.equal(explain([e],opts,p).empty,false);
 assert.equal(explain([e],{...opts,period:'all_time'},p).empty,false);
 assert.match(explain([e],{...opts,period:'current'},p).message,/沒有正在統計/);
});
test('明確區分空紀錄、其他月份、未知歸屬、測試與清空',()=>{
 assert.match(explain([],opts,p).message,/尚未保存/);
 assert.match(explain([e],{...opts,now:'2026-10-10T00:00:00Z'},p).message,/其他期間/);
 assert.match(explain([e],{...opts,channelLock:{channelId:A}},p).message,/還沒加入統計/);
 assert.match(explain([{...e,liveId:'youtube-test'}],opts,p).message,/測試資料/);
 assert.match(explain([e],{...opts,isReset:()=>true},p).message,/已清空/);
});
test('空榜說明不修改事件或放行其他頻道',()=>{
 const events=[{...e,liveId:'other000001'}],before=JSON.stringify(events);
 assert.equal(explain(events,opts,p).empty,true);assert.equal(JSON.stringify(events),before);
 assert.equal(explain([e],{...opts,kind:'gift'},p).empty,true);
});

