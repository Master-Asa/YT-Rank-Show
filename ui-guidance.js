/* Read-only explanations. Does not change record eligibility or saved settings. */
(function(root){
  'use strict';
  function explain(events,options,policy){
    const {kind,period,session={},channelLock,now=new Date().toISOString(),isReset=()=>false}=options;
    const kinds=kind==='jewel'?['jewel']:kind==='gift'?['sponsorgift']:['superchat','supersticker'];
    const all=events.filter(e=>kinds.includes(e.eventType));
    if(period==='current'&&!session.liveId)return {empty:true,message:'目前沒有正在統計的直播。\n可能是連線已結束，或這場直播還沒加入統計。本月與歷史不會因結束直播被刪除。',help:true};
    const filter={includeAll:true,channelLock,timezone:'Asia/Taipei'};
    if(period==='current'){filter.liveId=session.liveId;filter.service=session.service;}
    if(period==='monthly')filter.month=policy.dateParts(now).month;
    if(period==='today')filter.day=policy.dateParts(now).day;
    const scoped=policy.select(all,filter),valid=scoped.filter(e=>policy.eligible(e,isReset,channelLock));
    if(valid.length)return {empty:false,message:'',help:false};
    if(!all.length)return {empty:true,message:'本頁尚未保存'+({sc:'SC／貼圖',gift:'贈送會員',jewel:'寶石'}[kind])+'紀錄。\n其他瀏覽器或 OBS 的紀錄不會自動出現在這裡。',help:false};
    if(!scoped.length)return {empty:true,message:'這段期間沒有符合日期／場次的紀錄。\n本頁其他期間有 '+all.length+' 筆，請改看「歷史全部」或到「事件紀錄」核對時間。',help:false};
    const counts=new Map();
    for(const e of scoped){const reason=policy.status(e,isReset,channelLock);counts.set(reason,(counts.get(reason)||0)+1);}
    const list=[...counts].map(([reason,count])=>count+' 筆：'+reason.replace('隔離：','').replace('直播所屬頻道待確認','這場直播還沒加入統計（請核對實況主）'));
    return {empty:true,message:'這段期間已保存 '+scoped.length+' 筆，但目前沒有可計入的紀錄：\n'+list.join('\n')+'\n原始紀錄仍保留，不會為了顯示排行而解除測試或頻道限制。',help:scoped.some(e=>policy.reasons(e,channelLock).some(r=>/頻道.*確認|頻道鎖/.test(r)))};
  }
  if(typeof module==='object'&&module.exports){module.exports={explain};return;}
  root.RankingGuidance={explain};
  if(new URLSearchParams(location.search).has('obs'))return;
  const originalPreview=preview;
  preview=function(){
    originalPreview();
    const result=explain(state.events,{kind:$('kind').value,period:$('period').value,session:state.session,channelLock:currentChannelLock(),isReset:isResetEvent},RecordPolicy);
    $('rankingExplanation').hidden=!result.empty;
    const card=$('rankingExplanation');card.replaceChildren();
    if(result.empty){const [heading,...lines]=result.message.split('\n'),title=document.createElement('p');title.className='empty-state-title';title.textContent=heading;card.append(title);if(lines.length){const details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('p');summary.textContent='查看原因';body.className='empty-state-detail';body.textContent=lines.join('\n');details.append(summary,body);card.append(details);}}
    $('rankingHelp').hidden=!result.help;
    $('preview').hidden=result.empty;
  };
  ['period','kind','top'].forEach(id=>$(id).onchange=preview);
  $('rankingHelp').onclick=()=>document.querySelector('[data-tab="records"]').click();
  $('channelSetup').open=!currentChannelLock().channelId;
  function selectionHint(){
    const scope=$('exportScope').value;
    $('exportSelectionHint').textContent=scope==='month'?'下載 '+($('exportMonth').value||'所選月份')+' 的紀錄；不是最近 30 天。':scope==='session'?'只下載選定這一場直播的紀錄。':'下載本頁保存的全部歷史紀錄。';
  }
  const oldScope=$('exportScope').onchange;
  $('exportScope').onchange=()=>{oldScope();selectionHint();};
  $('exportMonth').onchange=selectionHint;
  $('downloadCsv').onclick=()=>document.querySelector('[data-export="'+$('exportContent').value+'"]').click();
  selectionHint();preview();
})(typeof globalThis!=='undefined'?globalThis:this);
