'use strict';
const crypto = require('node:crypto');
const RecordPolicy = require('../record-policy');
const ChannelLock = require('../channel-lock');
const Currency = require('../currency');

const DEFAULT_SETTINGS = Object.freeze({
  channelLock: ChannelLock.normalize(), timezone: 'Asia/Taipei', dollarCurrency: 'TWD', rates: { ...Currency.defaultRates },
  ratesUpdatedAt: '2026-09-09', showTitle: true, rankNameSpaces: 1, nameValueSpaces: 4, blankLines: 0,
  showAmount: true, showCurrency: true, showGiftUnit: true, giftUnit: '個', maxNameLength: 20, truncateNames: true, emptyText: ''
});
const {normalizeUnit,parsePaidText}=Currency;
function currencyDetails(data={},settings=DEFAULT_SETTINGS){return Currency.details(data,settings);}
function eventTypeOf(item) { const d=item?.data||{}; return String(d.giftType ?? d.type ?? item?.type ?? d.eventType ?? '').toLowerCase().replace(/[_-]/g,''); }
function fallbackUserKey(service, displayName, profileImage) { return 'fallback:' + crypto.createHash('sha256').update([service,displayName,profileImage].join('|')).digest('hex').slice(0,24); }
function normalizeEvent(item, session={}, settings=DEFAULT_SETTINGS, now=new Date()) {
  const d=item?.data||{}, type=eventTypeOf(item); const supported=['superchat','supersticker','sponsorgift','giftreceived','jewel'].includes(type);
  const displayName=String(d.displayName ?? d.name ?? d.userName ?? item?.name ?? '匿名'); const service=String(item?.service ?? d.service ?? '');
  const userId=String(d.userId ?? item?.userId ?? ''); const liveId=String(d.liveId ?? item?.liveId ?? 'unknown');
  const timestamp=String(d.timestamp ?? item?.timestamp ?? ''); const money=currencyDetails(d,settings); const giftInfo=RecordPolicy.gift(d), giftCount=giftInfo.giftCount;
  const base={service,liveId,eventType:type,userId,userKey:userId||fallbackUserKey(service,displayName,d.profileImage||''),timestamp,originalAmount:money.originalAmount,originalCurrency:money.normalizedCurrency||money.originalCurrency,giftCount,comment:String(d.comment ?? d.message ?? '')};
  const actualId=String(d.id ?? d.commentId ?? item?.commentId ?? ''); const eventId=actualId || 'fallback:'+crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex');
  return {schemaVersion:2,eventIdSource:actualId?'comment-id':'fallback',recordMode:settings.recordMode==='test'?'test':'production',explicitTest:d.isTest===true||item?.isTest===true,...giftInfo,eventId,service,liveId,streamTitle:String(d.streamTitle ?? session.streamTitle ?? ''),eventType:type,userId,displayName,profileImage:String(d.profileImage ?? ''),timestamp,...money,giftCount,...(type==='jewel'?RecordPolicy.jewel(d):{}),comment:base.comment,excluded:!supported,unsupported:!supported,createdAt:now.toISOString()};
}
function userKey(e){return e.userId||fallbackUserKey(e.service,e.displayName,e.profileImage)}
function inPeriod(e, period, ctx={}) { const t=new Date(e.timestamp).getTime(), now=new Date(ctx.now||Date.now()); if(!Number.isFinite(t))return false; if(period==='all_time')return true; if(period==='current')return e.service===ctx.service&&e.liveId===ctx.liveId; const parts=new Intl.DateTimeFormat('en-CA',{timeZone:ctx.timezone||'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(t)); const key=Object.fromEntries(parts.map(x=>[x.type,x.value])); const np=new Intl.DateTimeFormat('en-CA',{timeZone:ctx.timezone||'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now); const nk=Object.fromEntries(np.map(x=>[x.type,x.value])); return period==='today'?key.year===nk.year&&key.month===nk.month&&key.day===nk.day:key.year===nk.year&&key.month===nk.month; }
function rank(events,{kind='sc',period='all_time',limit=10,...ctx}={}) { return RecordPolicy.rank(events.filter(e=>RecordPolicy.eligible(e,undefined,ctx.channelLock)&&inPeriod(e,period,ctx)),kind).slice(0,limit).map(row=>({...row,userKey:JSON.stringify([row.service,row.userId]),reachedAt:new Date(row.lastTime).toISOString()})); }
function formatRanking(rows,{kind='sc',title='',...s}={}) { const cfg={...DEFAULT_SETTINGS,...s}; const lines=[]; if(cfg.showTitle&&title)lines.push(`【${title}】`); const gap='\n'.repeat(cfg.blankLines+1); rows.forEach((r,i)=>{let name=String(r.displayName);if(cfg.truncateNames&&name.length>cfg.maxNameLength)name=name.slice(0,cfg.maxNameLength);let line=`${i+1}.`+' '.repeat(cfg.rankNameSpaces)+name;if(cfg.showAmount){const value=kind==='sc'?Math.round(r.value).toLocaleString('zh-TW'):r.value;line+=' '.repeat(cfg.nameValueSpaces)+(kind==='sc'?(cfg.showCurrency?'NT$':'')+value:value+(cfg.showGiftUnit?(kind==='jewel'?' 顆':cfg.giftUnit):''));}lines.push(line)}); if(!rows.length&&cfg.emptyText)lines.push(cfg.emptyText); return lines.join(gap)+(lines.length?'\n':''); }
module.exports={DEFAULT_SETTINGS,normalizeUnit,parsePaidText,currencyDetails,normalizeEvent,rank,formatRanking,userKey,inPeriod};
