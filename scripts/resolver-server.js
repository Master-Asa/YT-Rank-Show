'use strict';
// Local service; /resolve is an authenticated, explicit-consent public YouTube lookup.
const http=require('node:http'),os=require('node:os'),crypto=require('node:crypto');
const {installedFonts,installedFontData}=require('../src/installed-fonts');
const {createObsBridge}=require('../src/obs-bridge');
const {resolvePublicUrl}=require('../src/youtube-resolver');
function localAddresses(){return new Set(['localhost','127.0.0.1','[::1]',...Object.values(os.networkInterfaces()).flat().filter(Boolean).map(x=>x.family==='IPv6'?'['+x.address+']':x.address)]);}
function allowedOrigin(raw,addresses=localAddresses()){
 try{const u=new URL(raw);return u.origin===raw&&['http:','https:'].includes(u.protocol)&&u.port==='11180'&&addresses.has(u.hostname);}catch{return false;}
}
function createResolverServer({fonts=installedFonts,fontData=installedFontData,runtime=null,updater=null,addresses=localAddresses(),resolveChannel=resolvePublicUrl}={}){
 const credential=crypto.randomBytes(32).toString('hex'),legacyObs=createObsBridge();
 let resolving=false,nextLookup=0;
 const server=http.createServer(async(req,res)=>{
  const port=server.address()?.port,hostAllowed=['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host);
  const origin=req.headers.origin,originAllowed=allowedOrigin(origin,addresses);
  function send(status,payload){if(res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));}
  if(!hostAllowed||origin&&!originAllowed)return send(403,{error:'只允許這台電腦的 OneComme 網頁來源'});
  if(originAllowed){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Private-Network','true');}
  if(req.method==='OPTIONS'){
   if(!originAllowed)return send(403,{error:'來源不允許'});
   res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-YT-Session');return send(204,{});
  }
  if(req.method==='GET'&&req.url==='/health')return send(200,{service:'yt-rank-local-service',version:3,background:!!runtime,publicChannelLookup:'explicit-consent'});
  if(!originAllowed)return send(403,{error:'缺少有效的本機 OneComme 網頁來源'});
  if(req.method==='GET'&&req.url==='/session')return send(200,{credential,background:!!runtime});
  const tokenMatch=req.url.match(/^\/obs\/(output|styles)\/([a-f0-9]{64})$/);
  if(runtime&&req.method==='GET'&&tokenMatch){
   if(tokenMatch[2]!==runtime.readToken)return send(404,{error:'OBS 金鑰不符，請在原管理頁完成資料移入後核對網址'});
   const snapshot=runtime.snapshot();return send(200,tokenMatch[1]==='output'?snapshot:{revision:snapshot.styleRevision,styles:runtime.styles});
  }
  if(runtime&&req.url.startsWith('/obs/'))return send(409,{error:'背景插件已接管 OBS，網頁不能覆寫排行'});
  if(!runtime&&await legacyObs(req,send,originAllowed))return;
  const provided=req.headers['x-yt-session'];
  if(typeof provided!=='string'||!/^[a-f0-9]{64}$/.test(provided)||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(credential)))return send(403,{error:'本機工作階段已失效，請重新載入管理頁'});
  if(req.url==='/updates'){
   if(!updater)return send(503,{error:'更新服務尚未啟用；請在 OneComme 使用新版插件。'});
   try{if(req.method==='GET')return send(200,updater.status());if(req.method!=='POST')return send(405,{error:'只接受 GET 或 POST'});if(String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return send(415,{error:'只接受 JSON'});let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096)return send(413,{error:'更新請求過大'});chunks.push(chunk);}const b=JSON.parse(Buffer.concat(chunks));if(b.action==='preferences'&&typeof b.automatic==='boolean')return send(200,await updater.savePrefs(b.automatic));if(b.action==='check'&&b.consent===true)return send(200,await updater.check());if(b.action==='download'&&b.consent===true)return send(200,await updater.stage());if(b.action==='install'&&b.confirmed===true)return send(200,await updater.install());return send(400,{error:'缺少更新同意或操作無效'});}catch(e){return send(400,{error:e.message});}
  }
  if(req.url==='/resolve'){
   if(req.method!=='POST')return send(405,{error:'只接受主動查詢'});
   if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(415,{error:'只接受 JSON'});
   try{
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192)return send(413,{error:'查詢內容過大'});chunks.push(chunk);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!body||body.consent!==true||typeof body.url!=='string'||Object.keys(body).some(k=>!['url','consent'].includes(k)))return send(400,{error:'請先同意向 YouTube 查詢公開頻道資料'});
    if(resolving||Date.now()<nextLookup)return send(429,{error:'查詢過於頻繁，請稍候 5 秒再試'});
    resolving=true;nextLookup=Date.now()+5000;
    try{return send(200,await resolveChannel(body.url));}finally{resolving=false;}
   }catch(e){return send(400,{error:e.message});}
  }
  if(req.method==='POST'&&req.url==='/handoff'&&!runtime){send(200,{ok:true});setTimeout(()=>{server.closeAllConnections();server.close();},50);return;}
  const fontMatch=req.url.match(/^\/fonts\/([a-f0-9]{64})$/);if(req.method==='GET'&&fontMatch){try{return send(200,await fontData(fontMatch[1]));}catch(e){return send(400,{error:e.message});}}
  if(req.method==='GET'&&req.url==='/fonts'){try{return send(200,{fonts:await fonts()});}catch{return send(503,{error:'無法讀取 Windows 字型'});}}
  if(req.url==='/styles'&&req.method==='GET'&&runtime)return send(200,{styles:runtime.styles,revision:runtime.snapshot().styleRevision});
  if(req.url!=='/api'||!runtime)return send(503,{error:'OneComme 背景插件尚未啟用；本機同步器不負責背景收錄。'});
  if(!['GET','POST','PUT'].includes(req.method))return send(405,{error:'Method not allowed'});
  try{
   let body={};
   if(req.method!=='GET'){
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(415,{error:'只接受 JSON'});
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>128*1024*1024)throw Error('請求超過 128 MB，未更動資料');chunks.push(chunk);}
    body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   }
   const result=await runtime.request({method:req.method,body});send(result.code,result.response);
  }catch(e){send(400,{error:e.message});}
 });
 server.requestTimeout=60000;server.headersTimeout=10000;return server;
}
if(require.main===module){const server=createResolverServer();server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'11181 已在使用，沒有另開服務。':e.message);process.exitCode=1;});server.listen(11181,'127.0.0.1',()=>console.log('YT Rank Show 本機同步器（離線）。背景收錄請在 OneComme 啟用插件。'));}
module.exports={createResolverServer,allowedOrigin,localAddresses};
