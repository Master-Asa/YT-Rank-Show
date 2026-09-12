(function(root){
'use strict';
function presentation(rows,kind,period,settings={}){
 const n=(v,max)=>Math.max(0,Math.min(max,Number(v)||0)),s=settings;
 const custom=typeof s.customTitle==='string'?Array.from(s.customTitle.replace(/[\u0000-\u001f\u007f]/g,' ').trim()).slice(0,60).join(''):'';
 const title=({current:'本場',today:'今日',monthly:'本月',all_time:'歷史'}[period]||period)+' '+({sc:'SC',gift:'贈送會員',jewel:'寶石'}[kind])+' 排行榜';
 return {title:s.showTitle?(custom||'【'+title+'】'):'',gap:'\n'.repeat(n(s.blankLines,2)+1),rows:rows.map((r,i)=>{
  const chars=Array.from(String(r.displayName||'匿名').replace(s.hideAtPrefix===true?/^@/:/^$/,'')),max=Math.max(1,Number(s.maxNameLength)||20);
  const name=s.truncateNames!==false&&chars.length>max?chars.slice(0,max).join('')+'…':chars.join('');
  return {rank:(i+1)+'.',nameGap:' '.repeat(n(s.rankNameSpaces,20)),name,valueGap:' '.repeat(n(s.nameValueSpaces,20)),value:kind==='sc'?'NT$'+Math.round(r.value).toLocaleString('zh-TW'):r.value.toLocaleString('zh-TW')+(kind==='jewel'?' 顆':'個')};
 })};
}
function asText(view){return [...(view.title?[view.title]:[]),...view.rows.map(r=>r.rank+r.nameGap+r.name+r.valueGap+r.value)].join(view.gap);}
function format(rows,kind,period,settings={}){return asText(presentation(rows,kind,period,settings));}
function snapshot({events,settings,session,channelLock,isReset,themes={},now=new Date().toISOString()},policy){
 const month=policy.dateParts(now,settings.timezone).month,outputs={},views={};
 for(const period of ['current','monthly','all_time']){
  const filter={timezone:settings.timezone,channelLock};
  if(period==='monthly')filter.month=month;else if(period==='current'){filter.liveId=session.liveId;filter.service=session.service;}
  const inactive=period==='current'&&!session.liveId;
  const selected=inactive?[]:policy.select(events,filter,isReset);
  for(const kind of ['sc','gift','jewel']){const ranked=inactive?[]:policy.rank(selected,kind);for(const top of [3,5,10]){
   const key=period+'-'+kind+'-'+top,theme=themes[kind+':'+period]||themes[kind];
   views[key]=presentation(ranked.slice(0,top),kind,period,theme?.enabled?{...settings,showTitle:true,customTitle:theme.titles?.[period],truncateNames:true,maxNameLength:theme.maxNameLength||20,hideAtPrefix:theme.hideAtPrefix!==false}:{...settings,hideAtPrefix:theme?.hideAtPrefix!==false});
   outputs[key]=asText(views[key]);
  }
  }
  outputs[period+'-jewel']=inactive?'':String(policy.jewelTotal(selected));
 }
 return {version:1,month,channelId:channelLock.channelId||'',outputs,views};
}
const api={format,snapshot,presentation,asText};if(typeof module==='object'&&module.exports)module.exports=api;else root.RankOutput=api;
})(typeof globalThis!=='undefined'?globalThis:this);
