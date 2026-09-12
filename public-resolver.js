/* Public URL contract. No fetch, cookies, login or storage in this module. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./channel-lock'):root.ChannelLock);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PublicResolver=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(lock){
  'use strict';
  function input(value){
    let raw=String(value||'').trim();
    if(!raw||raw.length>2048)throw new Error('請貼上有效的 YouTube 頻道或直播網址');
    if(lock.validChannel(raw))raw='https://www.youtube.com/channel/'+raw;
    else if(lock.validLive(raw))raw='https://www.youtube.com/watch?v='+raw;
    else if(raw.startsWith('@'))raw='https://www.youtube.com/'+raw;
    let u;try{u=new URL(raw)}catch{throw new Error('請貼完整網址，或使用 @頻道代號')}
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||
       !['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(u.hostname))
      throw new Error('只接受 YouTube 公開網址，不接受其他網站或特殊連接埠');
    const videoId=lock.parseLive(u.href);
    if(videoId)return {kind:'video',videoId,url:'https://www.youtube.com/watch?v='+videoId};
    if(u.hostname==='youtu.be')throw new Error('YouTube 短網址中的影片 ID 不正確');
    let path;try{path=decodeURIComponent(u.pathname)}catch{throw new Error('網址編碼不正確')}
    const m=path.match(/^\/(@[^/?#\s\\]+|channel\/UC[A-Za-z0-9_-]{22}|(?:c|user)\/[^/?#\s\\]+)(?:\/(?:featured|videos|streams|live|shorts|about|playlists|community))?\/?$/);
    if(!m||m[1].split('/').some(p=>p==='.'||p==='..'))throw new Error('請使用頻道首頁、@代號、直播或影片網址');
    const channelId=m[1].startsWith('channel/')?m[1].slice(8):'';
    const canonical=new URL('https://www.youtube.com/');
    canonical.pathname='/'+m[1];
    return {kind:'channel',channelId,url:canonical.href};
  }
  function validate(value,result){
    const target=input(value);
    if(!result||result.source!=='youtube-public-metadata'||result.requestUrl!==target.url||
       !lock.validChannel(result.channelId)||typeof result.channelName!=='string'||!result.channelName.trim()||
       result.channelName.length>300||!Number.isFinite(Date.parse(result.resolvedAt)))
      throw new Error('解析結果不完整或與本次查詢不符，未套用頻道設定');
    if(target.channelId&&result.channelId!==target.channelId)throw new Error('頻道 ID 與查詢網址不符');
    if(target.kind==='video'&&result.liveId!==target.videoId||target.kind==='channel'&&result.liveId)
      throw new Error('直播歸屬結果與查詢影片不符');
    return {source:result.source,requestUrl:target.url,channelId:result.channelId,
      channelName:result.channelName.trim(),channelUrl:'https://www.youtube.com/channel/'+result.channelId,
      liveId:target.kind==='video'?target.videoId:'',videoTitle:String(result.videoTitle||'').slice(0,500),
      resolvedAt:result.resolvedAt};
  }
  return {input,validate};
});
