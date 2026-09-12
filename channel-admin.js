'use strict';
(function(){
  const notice=$('channelNotice');
  function notify(message){text(notice,message);if($('channelSetupNotice'))text($('channelSetupNotice'),message);}
  let busy=false,restoredChannel='',restoredLive='';
  function refresh(){
    updateObsUrls();
    const lock=currentChannelLock(),valid=!!lock.channelId;
    text($('channelLockStatus'),valid?'統計對象：'+(lock.channelName||lock.channelId)+'｜已加入 '+Object.values(lock.bindings).filter(b=>b.channelId===lock.channelId).length+' 場直播（設定已保存）':'先選擇要統計的實況主 → 頻道與直播；已收錄的紀錄仍保留');
    if(document.activeElement!==$('channelIdInput')&&!window.YTChannelLookup?.dirty())$('channelIdInput').value=lock.channelId;
    if($('channelNameInput')&&document.activeElement!==$('channelNameInput'))$('channelNameInput').value=lock.channelName||'';
    if($('autoChannelUrl')){$('autoChannelUrl').value=valid?'https://www.youtube.com/channel/'+lock.channelId:'';$('copyAutoChannelUrl').disabled=!valid;const auto=Object.values(lock.bindings).filter(b=>b.channelId===lock.channelId&&b.source==='onecomme-channel-url').length;text($('autoChannelNotice'),valid?(auto?'已自動確認 '+auto+' 場；其他連線不會改變統計對象。':'等待 OneComme 提供此頻道的直播資訊。'):'請先設定實況主頻道。');}
    if($('nativePromptEnabled')){$('nativePromptEnabled').checked=lock.popupEnabled!==false;text($('nativePromptNotice'),state.promptWarning||'');}
    const mapping=Object.entries(lock.bindings);
    if(valid&&restoredChannel!==lock.channelId&&document.activeElement!==$('publicChannelInput')){
      $('publicChannelInput').value=lock.channelSourceUrl||'https://www.youtube.com/channel/'+lock.channelId;
      restoredChannel=lock.channelId;
    }
    const previous=$('channelLiveChoice').value,known=new Set();
    for(const [live,b] of mapping)if(b.channelId===lock.channelId)known.add(live);
    for(const e of state.events)if(e.service==='youtube'&&ChannelLock.validLive(e.liveId))known.add(e.liveId);
    for(const s of liveServices||[]){const live=ChannelLock.parseLive(s.url);if(live)known.add(live);}
    const empty=document.createElement('option');empty.value='';text(empty,'選擇已收到的直播，或在下方貼網址');
    $('channelLiveChoice').replaceChildren(empty,...[...known].sort().map(live=>{
      const option=document.createElement('option');option.value=live;
      text(option,(lock.videoCatalog[live]?.title||state.events.find(e=>e.liveId===live&&e.streamTitle)?.streamTitle||'尚未取得影片標題')+' · '+live+(lock.bindings[live]?'（已有歸屬）':lock.dismissedLives[live]?.channelId===lock.channelId?'（已略過提示，可手動加入）':'（還沒加入統計）'));return option;
    }));
    if(known.has(previous))$('channelLiveChoice').value=previous;
    const joined=mapping.filter(([,b])=>b.channelId===lock.channelId).map(([live])=>live);
    if(joined.length===1&&restoredLive!==lock.channelId&&document.activeElement!==$('channelLiveInput')){
      if(!$('channelLiveInput').value)$('channelLiveInput').value='https://www.youtube.com/watch?v='+joined[0];
      if(!previous)$('channelLiveChoice').value=joined[0];
      restoredLive=lock.channelId;
    }
    text($('channelUrlWarning'),'加入後會更新新版 OBS 同步來源；首次使用請到「OBS 輸出」複製網址。');
  }
  async function save(next){
    if(busy)return false;busy=true;
    $('saveChannelLock').disabled=true;$('confirmChannelLive').disabled=true;
    try{
      if(connectionMode==='plugin')await api('PUT',{channelLock:next});
      else localStorage.setItem('yt-rank-show-settings-v0.1',JSON.stringify({...state.settings,channelLock:next}));
      state.settings={...state.settings,channelLock:next};
      if(liveServices!==null)applyServices(liveServices);
      else if(!channelAllowsLive(state.session.liveId))state.session={};
      updateObsUrls();render(connectionMode!=='none');refresh();return true;
    }catch(e){notify('儲存或更新畫面失敗，請重新載入核對頻道鎖：'+e.message);return false}
    finally{busy=false;$('saveChannelLock').disabled=false;$('confirmChannelLive').disabled=false;}
  }
  if($('copyAutoChannelUrl'))$('copyAutoChannelUrl').onclick=async()=>{try{await navigator.clipboard.writeText($('autoChannelUrl').value);text($('autoChannelNotice'),'已複製，請貼到 OneComme 的連線網址。');}catch{text($('autoChannelNotice'),'無法自動複製，請選取上方網址手動複製。');}};
  if($('nativePromptEnabled'))$('nativePromptEnabled').onchange=async()=>{await save({...currentChannelLock(),popupEnabled:$('nativePromptEnabled').checked});};
  $('saveChannelLock').onclick=async()=>{
    const id=ChannelLock.parseChannel($('channelIdInput').value);
    if(!id){const message='這個網址需要先查詢：請勾選同意，再按「查詢頻道」。也可直接填 UC 開頭的完整 24 碼 Channel ID 離線儲存。';notify(message);if($('channelSetupNotice'))text($('channelSetupNotice'),message);return}
    const old=currentChannelLock();
    if(old.channelId!==id&&!confirm('鎖定實況主頻道 '+id+'？只有已確認屬於此頻道的直播會計入各期間排行。既有事件不會刪除；新版 OBS 同步來源會更新。'))return;
    if(await save({...old,channelId:id,channelName:$('channelNameInput')?.value.trim().slice(0,100)||(old.channelId===id?old.channelName:''),channelSourceUrl:old.channelId===id?old.channelSourceUrl:'',channelResolvedAt:old.channelId===id?old.channelResolvedAt:''}))notify('頻道已鎖定。接著確認直播歸屬；此設定不會隨 OneComme 切換連線而改變。');
  };
  $('channelLiveChoice').onchange=()=>{$('channelLiveInput').value=$('channelLiveChoice').value;};
  $('confirmChannelLive').onclick=async()=>{
    try{
      const old=currentChannelLock(),next=ChannelLock.bind(old,$('channelLiveInput').value);
      const video=ChannelLock.parseLive($('channelLiveInput').value);
      if(!confirm('請核對：直播 '+video+' 確實屬於頻道 '+old.channelId+'？這是人工歸屬確認，不是 YouTube 線上驗證；會套用到該直播已保存及之後收到的紀錄，其他隔離規則仍有效。'))return;
      if(await save(next))notify('已記住這場直播的頻道歸屬。新版 OBS 同步來源會更新；測試與其他不合格事件仍不計榜。');
    }catch(e){notify(e.message)}
  };
  window.YTChannelAdmin={async applyResolution(value,result,mode='lock'){
    try{
      const r=PublicResolver.validate(value,result),old=currentChannelLock();
      if(mode==='verify'&&(!old.channelId||old.channelId!==r.channelId))throw new Error('這場直播不是已鎖定的頻道，未加入，也沒有更換鎖定目標');
      const switching=old.channelId&&old.channelId!==r.channelId;
      let next={...old,channelId:r.channelId,channelName:r.channelName,channelSourceUrl:r.requestUrl,channelResolvedAt:r.resolvedAt};
      if(r.liveId){
        next=ChannelLock.bind(next,r.liveId);
        next.bindings[r.liveId]={...next.bindings[r.liveId],source:r.source,evidenceUrl:r.requestUrl,channelName:r.channelName};
      }
      if(!confirm((switching?'注意：即將更換原本鎖定的頻道。\n':'')+'確認 '+r.channelName+'（'+r.channelId+'）'+(r.liveId?'，並記住直播 '+r.liveId+' 的歸屬':' 為鎖定頻道')+'？原始紀錄不刪除，其他隔離規則不解除。'))return false;
      if(await save(next)){notify('已確認 '+r.channelName+(r.liveId?' 及這場直播的歸屬':'。新直播可用「查詢直播所屬頻道」確認')+'。請到「OBS 輸出」確認同步正常。');return true;}
      return false;
    }catch(e){notify(e.message);return false}
  }};
  window.addEventListener('storage',event=>{
    if(event.key!=='yt-rank-show-settings-v0.1'||new URLSearchParams(location.search).has('obs')||connectionMode==='plugin')return;
    try{
      const settings=JSON.parse(event.newValue||'{}');
      state.settings={...state.settings,channelLock:ChannelLock.normalize(settings.channelLock)};
      if(liveServices!==null)applyServices(liveServices);
      updateObsUrls();render(connectionMode!=='none');refresh();
    }catch{notify('另一個分頁的頻道設定無法讀取，請重新載入核對。')}
  });
  new MutationObserver(refresh).observe($('eventRows'),{childList:true});
  // admin.js generated initial URLs before it restored saved settings.
  updateObsUrls();refresh();
})();
