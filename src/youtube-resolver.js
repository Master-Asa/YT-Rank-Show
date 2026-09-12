'use strict';
// Explicit public-channel lookup; this module never receives runtime or credentials.
const https=require('node:https'),dns=require('node:dns').promises,net=require('node:net');
const Public=require('../public-resolver'),Lock=require('../channel-lock');
function publicIPv4(ip){
 if(net.isIP(ip)!==4)return false;
 const [a,b,c]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a===192&&b===0||a===192&&b===88&&c===99||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
}
// Match the system name-resolution path used by the old fetch implementation.
// Do not use resolve4(): direct DNS can be refused inside the OneComme host.
async function systemAddresses(host,lookup=dns.lookup){
 try{return (await lookup(host,{family:4,all:true})).map(item=>item.address);}
 catch{throw Error('Windows 無法解析 YouTube 位址，請檢查網路後重試；未更動頻道設定');}
}
function download(url,{resolve4=systemAddresses,get=https.get,timeout=10000,maxBytes=4*1024*1024}={}){
 const u=new URL(url);
 const watch=u.pathname==='/watch'&&/^\?v=[A-Za-z0-9_-]{11}$/.test(u.search);
 if(u.origin!=='https://www.youtube.com'||u.username||u.password||u.port||u.hash||u.search&&!watch)throw Error('不允許的查詢目的地');
 return new Promise((resolve,reject)=>{
  let req,done=false;const timer=setTimeout(()=>finish(Error('YouTube 查詢逾時，請稍後重試或改填 Channel ID')),timeout);
  function finish(error,value){if(done)return;done=true;clearTimeout(timer);if(error){req?.destroy();reject(error);}else resolve(value);}
  Promise.resolve().then(()=>resolve4(u.hostname)).then(addresses=>{
   if(done)return;
   if(!addresses.length||addresses.some(ip=>!publicIPv4(ip)))throw Error('查詢目的地不是公開網路位址');
   req=get(u,{agent:false,family:4,lookup(host,options,callback){const ip=addresses[0];if(options?.all)callback(null,[{address:ip,family:4}]);else callback(null,ip,4);},headers:{'Accept':'text/html','Accept-Encoding':'identity','User-Agent':'YT-Rank-Show/PublicChannelLookup'}},res=>{
    if(res.statusCode!==200){res.destroy();return finish(Error('YouTube 未提供可讀取的頻道頁面（HTTP '+res.statusCode+'）；請改填 Channel ID'));}
    if(!/^text\/html(?:;|$)/i.test(res.headers['content-type']||'')||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.destroy();return finish(Error('YouTube 回應格式不支援'));}
    let size=0;const chunks=[];
    res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){res.destroy();finish(Error('YouTube 回應過大，已停止查詢'));}else chunks.push(chunk);});
    res.on('end',()=>finish(null,Buffer.concat(chunks).toString('utf8')));res.on('error',()=>finish(Error('YouTube 連線中斷')));
   });req.on('error',()=>finish(Error('無法連線至 YouTube，請稍後重試或改填 Channel ID')));
  }).catch(e=>finish(e));
 });
}
function initialData(html,name='ytInitialData'){
 if(!['ytInitialData','ytInitialPlayerResponse'].includes(name))throw Error('不支援的公開資料欄位');
 const match=new RegExp('(?:var\\s+'+name+'\\s*=|window\\["'+name+'"\\]\\s*=|'+name+'\\s*=)\\s*\\{').exec(html);
 if(!match)throw Error('找不到公開頻道資料；YouTube 可能要求驗證或已變更格式，請改填 Channel ID');
 const start=match.index+match[0].lastIndexOf('{');let depth=0,string=false,escape=false;
 for(let i=start;i<html.length;i++){const ch=html[i];if(string){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')string=false;}else if(ch==='"')string=true;else if(ch==='{')depth++;else if(ch==='}'&&!--depth)return JSON.parse(html.slice(start,i+1));}
 throw Error('YouTube 公開資料不完整');
}
function parseChannelPage(html,target){
 const data=initialData(html),meta=data?.metadata?.channelMetadataRenderer;
 if(!meta||!Lock.validChannel(meta.externalId)||typeof meta.title!=='string'||!meta.title.trim())throw Error('無法確認頻道，未更動設定');
 return Public.validate(target.url,{source:'youtube-public-metadata',requestUrl:target.url,channelId:meta.externalId,channelName:meta.title,liveId:'',resolvedAt:new Date().toISOString()});
}
async function resolvePublicUrl(value,{downloadPage=download}={}){
 const target=Public.input(value);if(target.kind!=='channel')throw Error('這裡只查詢頻道首頁，請勿貼直播或影片網址');
 return parseChannelPage(await downloadPage(target.url),target);
}
async function resolveVideoUrl(value,{downloadPage=download}={}){
 const target=Public.input(value);if(target.kind!=='video')throw Error('請使用有效的影片網址');
 const data=initialData(await downloadPage(target.url),'ytInitialPlayerResponse'),details=data?.videoDetails;
 if(!details||details.videoId!==target.videoId||!Lock.validChannel(details.channelId)||typeof details.title!=='string'||!details.title.trim()||typeof details.author!=='string'||!details.author.trim())throw Error('影片不公開、受限制或缺少作者資料，無法確認所屬頻道');
 return Public.validate(target.url,{source:'youtube-public-metadata',requestUrl:target.url,channelId:details.channelId,channelName:details.author,liveId:details.videoId,videoTitle:details.title,resolvedAt:new Date().toISOString()});
}
module.exports={resolvePublicUrl,resolveVideoUrl,download,parseChannelPage,publicIPv4,systemAddresses};
