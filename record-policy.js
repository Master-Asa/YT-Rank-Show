/* Shared, offline record validation and export policy. No storage side effects. */
(function(root,factory){
  const policy=factory(typeof module==='object'&&module.exports?require('./channel-lock'):root.ChannelLock);
  if(typeof module==='object'&&module.exports)module.exports=policy;
  else root.RecordPolicy=policy;
})(typeof globalThis!=='undefined'?globalThis:this,function(ChannelLock){
  'use strict';
  const TYPES=['superchat','supersticker','sponsorgift','giftreceived','jewel'];
  const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
  function gift(d){
    for(const key of ['giftCount','count','quantity']){
      if(d[key]===undefined||d[key]===null||String(d[key]).trim()==='')continue;
      const value=Number(String(d[key]).replace(/,/g,''));
      return {giftCount:Number.isSafeInteger(value)&&value>0?value:0,giftCountSource:'structured:'+key};
    }
    // Deliberately do not parse arbitrary numbers in names or chat messages.
    const comment=String(d.comment||'').replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/gi,' ');
    const match=comment.match(/(?:贈送|赠送)(?:了)?\s*([\d,]+)\s*(?:個|个|份)\s*(?:頻道|频道)?\s*(?:會員|会员)/)
      ||comment.match(/(?:贈送|赠送)(?:了)?\s*([\d,]+)\s*(?:個|个|份)\s*(?:[「『][^」』]*[」』]\s*)?(?:會籍|会籍)/)
      ||comment.match(/\bgifted\s+([\d,]+)\s+(?:[\w '-]+\s+)?memberships?\b/i)
      ||comment.match(/([\d,]+)\s*件のメンバーシップ.*ギフト/);
    const n=match?Number(match[1].replace(/,/g,'')):0;
    return {giftCount:Number.isSafeInteger(n)&&n>0?n:0,giftCountSource:match?'explicit-gift-message':'unknown'};
  }
  // OneComme 9.1.1: jewels is unit value; giftCount is cumulative combo count.
  function jewel(d){
    const integer=v=>(typeof v==='number'||typeof v==='string'&&/^\d+$/.test(v))&&Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
    const unit=integer(d.jewels),count=d.giftCount===undefined?1:integer(d.giftCount);
    const total=unit!==null&&count!==null&&Number.isSafeInteger(unit*count)?unit*count:null;
    return {jewelUnit:unit,jewelGiftCount:count,jewelTotal:total,jewelGiftId:typeof d.giftId==='string'?d.giftId:'',
      jewelCountSource:total===null?'unknown':'onecomme-jewels-times-giftCount',
      originalAmount:null,originalCurrency:'',normalizedCurrency:null,exchangeRate:null,amountTwd:null,
      giftCount:0,giftCountSource:'not-membership'};
  }
  function jewelTotal(events){return events.reduce((sum,e)=>e.eventType==='jewel'&&Number.isSafeInteger(e.jewelTotal)&&e.jewelTotal>0?sum+e.jewelTotal:sum,0);}
  function repairMembership(events){
    // Return new records. Preserve prior derived fields and every original row.
    const result=events.map(e=>({...e})),groups=new Map();let repaired=0;
    for(const e of result){
      if(e.eventType!=='sponsorgift')continue;
      const group=groups.get(identity(e))||[];group.push(e);groups.set(identity(e),group);
    }
    for(const rows of groups.values()){
      const evidence=rows.map(e=>gift({comment:e.comment}));
      if(evidence.some(x=>!x.giftCount))continue;
      const first=rows[0],count=evidence[0].giftCount;
      // Legacy rows omitted these metadata fields. Accept that omission only when
      // the group also contains the same upstream comment ID from the newer schema.
      const mixedSource=rows.some(e=>e.eventIdSource===undefined)&&rows.some(e=>e.eventIdSource!==undefined);
      if(mixedSource&&(!rows.some(e=>e.eventIdSource==='comment-id')||rows.some(e=>e.eventIdSource!==undefined&&e.eventIdSource!=='comment-id')))continue;
      const stable=e=>JSON.stringify([e.service,e.liveId,e.eventId,e.eventIdSource??'comment-id',e.userId,e.timestamp,e.recordMode??'production',!!e.explicitTest,!!e.excluded,String(e.comment||'').replace(/<[^>]*>/g,'').trim()]);
      if(rows.some((e,i)=>stable(e)!==stable(first)||evidence[i].giftCount!==count))continue;
      // Never override conflicting verified structured quantities.
      if(rows.some(e=>e.giftCountSource?.startsWith('structured:')&&e.giftCount!==count))continue;
      if(rows.every(e=>e.membershipRepairVersion===1))continue;
      rows.forEach((e,i)=>{
        e.membershipRepairBefore=e.membershipRepairBefore||{giftCount:e.giftCount,giftCountSource:e.giftCountSource,auditReasons:e.auditReasons};
        e.giftCount=count;e.giftCountSource='explicit-gift-message';e.membershipRepairVersion=1;
        e.auditReasons=(e.auditReasons||[]).filter(r=>r!=='相同事件 ID 的內容衝突');
        // Retain duplicate raw rows for audit, but only one contributes to totals.
        if(i>0)e.auditReasons.push('會員解析修復：相同事件副本，不重複計數');
        repaired++;
      });
    }
    return {events:result,repaired};
  }
  function validTimestamp(value){
    const m=typeof value==='string'&&value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i);
    if(!m||!Number.isFinite(Date.parse(value)))return false;
    return +m[2]>=1&&+m[2]<=12&&+m[3]>=1&&+m[3]<=new Date(Date.UTC(+m[1],+m[2],0)).getUTCDate()&&+m[4]<24&&+m[5]<60&&+m[6]<60;
  }
  const formatters=new Map();
  function dateParts(timestamp,timezone='Asia/Taipei'){
    if(!validTimestamp(timestamp))return null;
    try{
      if(!formatters.has(timezone)){if(formatters.size>=8)formatters.delete(formatters.keys().next().value);formatters.set(timezone,new Intl.DateTimeFormat('en',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}));}
      const parts=formatters.get(timezone).formatToParts(new Date(timestamp));
      const get=type=>parts.find(p=>p.type===type).value;
      return {day:get('year')+'-'+get('month')+'-'+get('day'),month:get('year')+'-'+get('month')};
    }catch{return null}
  }
  function identity(e){return JSON.stringify([e.service,e.liveId,e.eventId]);}
  function signature(e){
    if(e.eventType==='sponsorgift')return JSON.stringify([e.eventType,e.userId,e.timestamp,e.giftCount]);
    return JSON.stringify([e.eventType,e.userId,e.timestamp,e.originalAmount,e.normalizedCurrency,e.giftCount,e.jewelUnit,e.jewelGiftCount,e.jewelGiftId]);
  }
  function reasons(e,channelLock){
    const list=[...(e.auditReasons||[])];
    if(channelLock!==undefined){const issue=ChannelLock.reason(channelLock,e);if(issue)list.push(issue);}
    if(e.recordMode==='test'||e.liveId==='youtube-test'||e.explicitTest===true)list.push('測試資料');
    if(e.service!=='youtube')list.push('非 YouTube 來源');
    if(!e.liveId||e.liveId==='unknown')list.push('缺少直播 ID');
    if(!e.userId)list.push('缺少 userId，無法可靠合併使用者');
    if(!e.eventId||e.eventIdSource==='fallback')list.push('缺少原始事件 ID');
    const time=Date.parse(e.timestamp);
    if(!validTimestamp(e.timestamp))list.push('無效事件時間或缺少時區');
    const received=Date.parse(e.createdAt);
    if(Number.isFinite(time)&&Number.isFinite(received)&&time>received+300000)list.push('事件時間超前接收時間超過 5 分鐘');
    if(!TYPES.includes(e.eventType))list.push('未知事件類型');
    if(['superchat','supersticker'].includes(e.eventType)){
      if(!positive(e.originalAmount)||!positive(e.exchangeRate)||!positive(e.amountTwd)||!e.normalizedCurrency)list.push('金額／幣別／匯率待確認');
    }
    if(e.eventType==='sponsorgift'){
      if(!Number.isSafeInteger(e.giftCount)||e.giftCount<=0)list.push('贈送數量待確認');
      if(!e.giftCountSource)list.push('舊版贈送數量來源未驗證');
    }
    if(e.eventType==='jewel'&&(!Number.isSafeInteger(e.jewelUnit)||e.jewelUnit<=0||!Number.isSafeInteger(e.jewelGiftCount)||e.jewelGiftCount<=0||!Number.isSafeInteger(e.jewelTotal)||e.jewelTotal!==e.jewelUnit*e.jewelGiftCount||e.jewelCountSource!=='onecomme-jewels-times-giftCount'))list.push('寶石數量待確認（不以禮物個數或金額猜測）');
    return [...new Set(list)];
  }
  function status(e,isReset=()=>false,channelLock){
    if(isReset(e))return '已清空／不計入';
    if(e.excluded)return '手動排除';
    const issues=reasons(e,channelLock);
    if(issues.length)return '隔離：'+issues.join('；');
    if(e.eventType==='giftreceived')return '受贈紀錄／不計贈送榜';
    return '有效';
  }
  function eligible(e,isReset,channelLock){return status(e,isReset,channelLock)==='有效';}
  function ingest(events,event){
    const matches=events.filter(e=>identity(e)===identity(event));
    // Same anchor event may be emitted again as its combo grows or its unit value resolves.
    if(event.eventType==='jewel'&&matches.length===1){
      const old=matches[0];
      const same=old.eventType==='jewel'&&old.userId===event.userId&&old.timestamp===event.timestamp&&old.jewelGiftId===event.jewelGiftId;
      const compatible=old.jewelUnit==null||event.jewelUnit==null||old.jewelUnit===event.jewelUnit;
      if(same&&compatible&&old.recordMode===event.recordMode){
        const tested=old.explicitTest===true||event.explicitTest===true;
        const changed=tested!==old.explicitTest||event.jewelGiftCount>old.jewelGiftCount||old.jewelUnit==null&&event.jewelUnit!=null;
        const count=Math.max(old.jewelGiftCount||0,event.jewelGiftCount||0)||null;
        const unit=old.jewelUnit??event.jewelUnit;
        Object.assign(old,{explicitTest:tested,jewelUnit:unit,jewelGiftCount:count,
          jewelTotal:unit&&count&&Number.isSafeInteger(unit*count)?unit*count:null,
          jewelCountSource:unit&&count?'onecomme-jewels-times-giftCount':'unknown'});
        return changed;
      }
    }
    const duplicate=matches.find(e=>signature(e)===signature(event));
    if(duplicate){
      // An explicit upstream test flag is evidence; a local mode switch alone is not.
      if(event.explicitTest===true&&duplicate.explicitTest!==true){duplicate.explicitTest=true;return true;}
      return false;
    }
    if(matches.length){
      for(const e of [...matches,event])e.auditReasons=[...new Set([...(e.auditReasons||[]),'相同事件 ID 的內容衝突'])];
    }
    events.push(event);
    return true;
  }
  // Copy only touched identity groups; failed disk commits leave old rows intact.
  function ingestBatch(events,incoming){
    const index=new Map();
    events.forEach((event,i)=>{const key=identity(event);if(!index.has(key))index.set(key,[]);index.get(key).push(i);});
    const next=events.slice(),changedIndexes=new Set();let changed=false;
    for(const event of incoming){
      const key=identity(event),positions=index.get(key)||[],group=positions.map(i=>({...next[i]}));
      if(!ingest(group,{...event}))continue;
      changed=true;
      group.forEach((row,i)=>{const position=i<positions.length?positions[i]:next.length;if(i>=positions.length)positions.push(position);next[position]=row;changedIndexes.add(position);});
      index.set(key,positions);
    }
    return {events:changed?next:events,changed,indexes:[...changedIndexes]};
  }
  function select(events,filter={},isReset){
    return events.filter(e=>{
      if(filter.service&&e.service!==filter.service)return false;
      if(filter.liveId&&e.liveId!==filter.liveId)return false;
      if(filter.month&&dateParts(e.timestamp,filter.timezone)?.month!==filter.month)return false;
      if(filter.day&&dateParts(e.timestamp,filter.timezone)?.day!==filter.day)return false;
      return filter.includeAll||eligible(e,isReset,filter.channelLock);
    });
  }
  function rank(events,kind){
    const map=new Map();
    for(const e of events){
      const amount=kind==='jewel'?(e.eventType==='jewel'?e.jewelTotal:0):kind==='gift'?(e.eventType==='sponsorgift'?e.giftCount:0):
        (['superchat','supersticker'].includes(e.eventType)?e.amountTwd:0);
      if(!positive(amount))continue;
      const key=JSON.stringify([e.service,e.userId]);
      const row=map.get(key)||{service:e.service,userId:e.userId,displayName:e.displayName,value:0,lastTime:-Infinity};
      row.value=Math.round((row.value+amount)*100)/100;
      if(Date.parse(e.timestamp)>=row.lastTime){row.displayName=e.displayName;row.lastTime=Date.parse(e.timestamp);}
      map.set(key,row);
    }
    return [...map.values()].sort((a,b)=>b.value-a.value||a.lastTime-b.lastTime||a.userId.localeCompare(b.userId));
  }
  function csv(rows){
    const cell=value=>{
      let s=String(value??'');
      if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;
      return '"'+s.replace(/"/g,'""')+'"';
    };
    return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
  }
  function details(events,isReset,channelLock){
    const bindings=ChannelLock.normalize(channelLock).bindings;
    return csv([['平台','直播 ID','事件 ID','時間（原始）','日期（台北）','userId','聊天室名稱','類型','原始金額','原幣','匯率','台幣','贈送數量','數量來源','紀錄模式','狀態','留言','直播主 Channel ID','頻道歸屬來源','寶石單值','寶石禮物累計個數','寶石合計','寶石數量來源'],
      ...events.map(e=>[e.service,e.liveId,e.eventId,e.timestamp,dateParts(e.timestamp)?.day,e.userId,e.displayName,e.eventType,e.originalAmount,e.normalizedCurrency,e.exchangeRate,e.amountTwd,e.giftCount,e.giftCountSource,e.recordMode||'舊版',status(e,isReset,channelLock),e.comment,bindings[e.liveId]?.channelId||'',bindings[e.liveId]?.source||'',e.jewelUnit,e.jewelGiftCount,e.jewelTotal,e.jewelCountSource])]);
  }
  return {gift,repairMembership,jewel,jewelTotal,validTimestamp,dateParts,identity,signature,reasons,status,eligible,ingest,ingestBatch,select,rank,csv,details};
});
