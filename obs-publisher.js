'use strict';
(function(){
 if(new URLSearchParams(location.search).has('obs'))return;
 const KEY='yt-rank-show-obs-publisher-v1';let writeToken='',readToken='',busy=false,ready=false,styleAck=-1,styleRevision='';
 const notice=$('obsSyncStatus');
 try{
  writeToken=localStorage.getItem(KEY)||'';
  if(!/^[a-f0-9]{64}$/.test(writeToken)){
   writeToken=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
   localStorage.setItem(KEY,writeToken);
  }
 }catch(e){notice.textContent='OBS 同步無法啟用：發布設定無法保存。'+e.message;return;}
 globalThis.ObsOutput={get ready(){return ready;},url(kind,period){if(!ready)throw Error('請先等待背景輸出連線完成');if(!['sc','gift','jewel'].includes(kind)||!['current','monthly','all_time'].includes(period))throw Error('榜單不正確');const url=new URL('obs-live.html',location.href);url.hash=new URLSearchParams({sync:readToken,kind,period,top:'10'}).toString();return url.href;}};
 updateObsUrls=function(){globalThis.dispatchEvent(new Event('obs-links-updated'));};
 async function publish(){
  if(busy)return;
  if(connectionMode==='none'){notice.textContent='等待 OneComme 連線後發布排行';return;}
  if(connectionMode==='plugin'){
   busy=true;
   try{const live=await LocalRuntime.session();if(!live.background)throw Error('背景插件未啟用');readToken=state.readToken||'';ready=/^[a-f0-9]{64}$/.test(readToken);updateObsUrls();notice.textContent=state.lastError?'背景收錄警告：'+state.lastError+'；顯示的是已成功保存的排行。':'背景輸出正常 · OBS 每 2 秒自動讀取 · 可關閉管理頁';notice.dataset.state=state.lastError?'error':'ready';}
   catch(e){ready=false;updateObsUrls();notice.textContent='背景輸出連線中斷：'+e.message;notice.dataset.state='error';}
   finally{busy=false;}
   return;
  }
  busy=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   if(globalThis.StyleStore?.loaded&&styleAck!==StyleStore.revision){
    const sentRevision=StyleStore.revision;
    const styleResponse=await fetch('http://127.0.0.1:11181/obs/styles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({writeToken,styles:StyleStore.styles}),signal:controller.signal});const applied=await styleResponse.json();if(!styleResponse.ok||!applied.revision)throw Error(applied.error||'本機同步器尚未支援外觀');styleAck=sentRevision;styleRevision=applied.revision;
   }
   const snapshot=RankOutput.snapshot({events:state.events,settings:state.settings,session:state.session,channelLock:currentChannelLock(),isReset:isResetEvent,themes:globalThis.StyleStore?.styles||{}},RecordPolicy);
   const response=await fetch('http://127.0.0.1:11181/obs/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({writeToken,snapshot}),signal:controller.signal});
   const data=await response.json();
   if(!response.ok||!/^[a-f0-9]{64}$/.test(data.readToken||''))throw new Error(data.error||'本機同步器版本尚未更新');
   if(styleRevision&&data.styleRevision!==styleRevision){styleAck=-1;throw Error('外觀同步需要重送，正在自動重試');}
   readToken=data.readToken;ready=true;updateObsUrls();
   notice.textContent='OBS 同步正常 · '+new Date(data.updatedAt).toLocaleTimeString('zh-TW')+' 更新｜直播期間請保持這個管理頁開啟';
   notice.dataset.state='ready';
  }catch(e){notice.textContent='OBS 尚未同步：請啟動／更新本機同步器（11181）。'+e.message;notice.dataset.state='error';}
  finally{clearTimeout(timer);busy=false;}
 }
 $('publishObs').onclick=publish;window.addEventListener('rank-style-saved',publish);
 updateObsUrls();publish();setInterval(publish,2000);
})();
