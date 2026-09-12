/* Explicit, offline broadcaster ownership. Never infer it from a viewer ID. */
(function(root,factory){
  const value=factory();
  if(typeof module==='object'&&module.exports)module.exports=value;else root.ChannelLock=value;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const validChannel=id=>typeof id==='string'&&/^UC[A-Za-z0-9_-]{22}$/.test(id);
  const validLive=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{11}$/.test(id);
  function parseChannel(value){
    const s=String(value||'').trim();if(validChannel(s))return s;
    try{const u=new URL(s);if(u.protocol==='https:'&&/(^|\.)youtube\.com$/.test(u.hostname)){
      const match=u.pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})\/?$/);if(match)return match[1];
    }}catch{}return '';
  }
  function parseLive(value){
    const s=String(value||'').trim();if(validLive(s))return s;
    try{
      const u=new URL(s);if(!['http:','https:'].includes(u.protocol))return '';
      let id='';
      if(u.hostname==='youtu.be')id=u.pathname.slice(1);
      else if(/(^|\.)youtube\.com$/.test(u.hostname))id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:live|shorts)\/([^/]+)\/?$/)?.[1];
      return validLive(id)?id:'';
    }catch{return ''}
  }
  function normalize(input){
    const bindings={};
    if(input?.bindings&&typeof input.bindings==='object'&&!Array.isArray(input.bindings)){
      for(const [live,b] of Object.entries(input.bindings)){
        if(validLive(live)&&b&&validChannel(b.channelId)&&['manual-confirmation','youtube-public-metadata','onecomme-channel-url'].includes(b.source))
          bindings[live]={channelId:b.channelId,source:b.source,confirmedAt:typeof b.confirmedAt==='string'?b.confirmedAt:'',
            channelName:typeof b.channelName==='string'?b.channelName.slice(0,300):'',
            evidenceUrl:typeof b.evidenceUrl==='string'?b.evidenceUrl.slice(0,2048):''};
      }
    }
    const dismissedLives={};for(const [live,b] of Object.entries(input?.dismissedLives||{}).slice(-1000))if(validLive(live)&&validChannel(b?.channelId))dismissedLives[live]={channelId:b.channelId,at:typeof b.at==='string'?b.at.slice(0,40):''};
    const removedLives={},videoCatalog={};
    for(const [live,b] of Object.entries(input?.removedLives||{}))if(validLive(live)&&validChannel(b?.channelId))removedLives[live]={channelId:b.channelId,at:typeof b.at==='string'?b.at.slice(0,40):''};
    for(const [live,b] of Object.entries(input?.videoCatalog||{}))if(validLive(live)&&b&&['onecomme','youtube-public-metadata'].includes(b.source))videoCatalog[live]={title:typeof b.title==='string'?b.title.slice(0,500):'',source:b.source,channelId:validChannel(b.channelId)?b.channelId:'',channelName:typeof b.channelName==='string'?b.channelName.slice(0,300):'',updatedAt:typeof b.updatedAt==='string'?b.updatedAt.slice(0,40):''};
    return {popupEnabled:input?.popupEnabled!==false,dismissedLives,removedLives,videoCatalog,version:1,channelId:validChannel(input?.channelId)?input.channelId:'',bindings,
      channelName:typeof input?.channelName==='string'?input.channelName.slice(0,300):'',
      channelSourceUrl:typeof input?.channelSourceUrl==='string'?input.channelSourceUrl.slice(0,2048):'',
      channelResolvedAt:typeof input?.channelResolvedAt==='string'?input.channelResolvedAt:''};
  }
  function bind(input,video,now=new Date().toISOString()){
    const config=normalize(input),liveId=parseLive(video);
    if(!config.channelId)throw new Error('請先設定有效的實況主 Channel ID');
    if(!liveId)throw new Error('請填入有效的 YouTube 直播網址或 11 碼影片 ID');
    const evidence=config.videoCatalog[liveId];if(evidence?.source==='youtube-public-metadata'&&evidence.channelId&&evidence.channelId!==config.channelId)throw Error('已查詢資料顯示此影片屬於其他頻道，不能加入');
    const old=Object.hasOwn(config.bindings,liveId)?config.bindings[liveId]:null;
    if(old&&old.channelId!==config.channelId)throw new Error('此直播已被確認屬於另一頻道，不能直接覆蓋；請先核對原紀錄');
    delete config.dismissedLives[liveId];
    delete config.removedLives[liveId];
    config.bindings[liveId]={channelId:config.channelId,source:'manual-confirmation',confirmedAt:old?.confirmedAt||now};
    return config;
  }
  function removed(config,live){return !!config.channelId&&config.removedLives?.[live]?.channelId===config.channelId;}
  function unbind(input,video,now=new Date().toISOString()){
    const config=normalize(input),live=parseLive(video);if(!config.channelId||!live)throw Error('頻道或影片無效');
    const old=config.bindings[live];if(old&&old.channelId!==config.channelId)throw Error('不能修改其他頻道的歸屬');
    delete config.bindings[live];config.removedLives[live]={channelId:config.channelId,at:config.removedLives[live]?.at||now};return config;
  }
  function remember(input,live,info){const config=normalize(input);if(!validLive(live))return config;return normalize({...config,videoCatalog:{...config.videoCatalog,[live]:info}});}
  function reason(config,event){
    const channelId=validChannel(config?.channelId)?config.channelId:'';
    if(!channelId)return '尚未設定實況主頻道鎖';
    if(event.service!=='youtube')return '非 YouTube 頻道';
    if(validLive(event.liveId)&&removed(config,event.liveId))return '已移出統計';
    const bindings=config?.bindings,binding=bindings&&typeof bindings==='object'&&!Array.isArray(bindings)&&Object.hasOwn(bindings,event.liveId)?bindings[event.liveId]:null;
    if(!validLive(event.liveId)||!binding||!validChannel(binding.channelId)||!['manual-confirmation','youtube-public-metadata','onecomme-channel-url'].includes(binding.source))return '直播所屬頻道待確認';
    if(binding.channelId!==channelId)return '非鎖定的實況主頻道';
    return '';
  }
  function allows(config,liveId){return reason(config,{service:'youtube',liveId})==='';}
  function fromQuery(params){
    const channelId=params.get('channel')||'',bindings={};
    if(validChannel(channelId)){
      for(const live of (params.get('lives')||'').split(','))if(validLive(live))
        bindings[live]={channelId,source:'manual-confirmation',confirmedAt:''};
    }
    return normalize({channelId,bindings,channelName:params.get('channelName')||''});
  }
  function writeQuery(params,input){
    const lock=normalize(input);params.set('channel',lock.channelId);
    if(lock.channelName)params.set('channelName',lock.channelName);else params.delete('channelName');
    params.set('lives',Object.keys(lock.bindings).filter(live=>allows(lock,live)).sort().join(','));
  }
  return {validChannel,validLive,parseChannel,parseLive,normalize,bind,unbind,removed,remember,reason,allows,fromQuery,writeQuery};
});
