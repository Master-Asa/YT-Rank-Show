'use strict';
(function(){
 const q=new URLSearchParams(location.hash ? location.hash.slice(1) : location.search),token=q.get('sync'),kind=q.get('kind'),period=q.get('period'),top=q.get('top')||'10',out=document.getElementById('output');
 if(!/^[a-f0-9]{64}$/.test(token||'')||!['sc','gift','jewel'].includes(kind)||!['current','monthly','all_time'].includes(period)||!['3','5','10'].includes(top)){out.textContent='OBS 網址不完整，請從管理頁重新複製';return;}
 out.dataset.kind=kind;out.dataset.period=period;
 let key=period+'-'+kind+(kind==='jewel'&&!q.has('top')?'':'-'+top),boardTop=null;
 let appliedRevision='';const themeStyle=document.createElement('style');themeStyle.id='rankAppliedTheme';document.head.append(themeStyle);
 async function poll(){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const r=await fetch('http://127.0.0.1:11181/obs/output/'+token,{cache:'no-store',signal:controller.signal});
   const value=await r.json();
   if(!r.ok)throw new Error(value.error||'同步失敗');
   out.dataset.storageState=value.storageHealth?.error?'error':'ready';out.title=value.storageHealth?.error?'收錄警告：'+value.storageHealth.error+'；目前顯示已保存的排行。':'';
   if(value.version!==1||typeof value.outputs?.[key]!=='string')throw new Error('請更新本機同步器');
   if(value.styleRevision&&value.styleRevision!==appliedRevision){const themeResponse=await fetch('http://127.0.0.1:11181/obs/styles/'+token,{cache:'no-store',signal:controller.signal});const themeData=await themeResponse.json();if(!themeResponse.ok||themeData.revision!==value.styleRevision)throw Error('外觀更新中');const styles=RankTheme.normalizeMap(themeData.styles);themeStyle.textContent=kind==='jewel'&&!q.has('top')?'':RankTheme.css(RankTheme.select(styles,kind,period));boardTop=RankTheme.select(styles,kind,period).top;appliedRevision=themeData.revision;}else if(!value.styleRevision){themeStyle.textContent='';appliedRevision='';boardTop=null;}
   key=period+'-'+kind+(kind==='jewel'&&!q.has('top')?'':'-'+(boardTop||top));
   // Fail closed at month rollover before the publisher has sent the new month.
   const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).format(new Date());
   if(period==='monthly'&&value.month!==month)out.textContent='等待本月排行更新…';
   else ObsRenderer.render(out,value.views?.[key],value.outputs[key],kind);
  }catch(e){out.textContent='OBS 同步中斷：請確認 OneComme 的 YT Rank Show 背景插件已啟用';out.title=e.message;}
  finally{clearTimeout(timer);setTimeout(poll,2000);}
 }
 poll();
})();
