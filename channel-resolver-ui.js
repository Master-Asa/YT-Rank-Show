'use strict';
// No startup lookup. Consent is page-local and never persisted.
(function(){
 const input=$('channelIdInput'),notice=$('channelSetupNotice'),query=$('queryChannel'),consent=$('channelLookupConsent'),panel=$('channelLookupResult');
 let changed=false,busy=false,generation=0,result=null,source='';
 window.YTChannelLookup={dirty:()=>changed};
 function tell(message){notice.textContent=message;}
 function invalidate(){generation++;result=null;panel.hidden=true;}
 input.addEventListener('input',()=>{changed=true;invalidate();tell('');});
 consent.addEventListener('change',()=>{if(!consent.checked)invalidate();});
 query.onclick=async()=>{
  if(busy)return;
  if(!consent.checked){tell('請先勾選同意向 YouTube 查詢，或填 UC 開頭的 Channel ID 離線儲存。');return;}
  const value=input.value.trim();let target;
  try{target=PublicResolver.input(value);if(target.kind!=='channel')throw Error('請貼頻道首頁，不是直播或影片網址。');}catch(e){tell(e.message);return;}
  changed=true;invalidate();const ticket=generation;busy=true;query.disabled=true;tell('正在向 YouTube 查詢公開頻道資料…');
  try{
   const reply=await LocalRuntime.request('/resolve','POST',{url:target.url,consent:true});
   if(ticket!==generation||input.value.trim()!==value||!consent.checked)return;
   result=PublicResolver.validate(value,reply);source=value;
   $('channelLookupName').textContent=result.channelName;$('channelLookupId').textContent=result.channelId;panel.hidden=false;tell('請核對頻道名稱與 ID，確認後才會儲存。');
  }catch(e){if(ticket===generation)tell('查詢失敗：'+e.message+'。原設定未更動。');}
  finally{busy=false;query.disabled=false;}
 };
 $('useChannelLookup').onclick=async()=>{
  if(!result||input.value.trim()!==source||!consent.checked){invalidate();tell('輸入已變更，請重新查詢。');return;}
  const found=result;$('useChannelLookup').disabled=true;
  try{if(await YTChannelAdmin.applyResolution(source,found)){
   changed=false;input.value=found.channelId;invalidate();tell('已儲存 '+found.channelName+'。下方固定頻道網址已更新。');
  }else tell($('channelNotice').textContent||'尚未儲存。');}finally{$('useChannelLookup').disabled=false;}
 };
 $('publicResolveNotice').textContent='手動加入直播只做本機歸屬確認，不會連線 YouTube。';
})();
