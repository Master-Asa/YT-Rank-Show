'use strict';
const {createHash}=require('node:crypto'),Theme=require('../style-theme');
function createThemeBridge({now=Date.now}={}){
 const saved=new Map();
 const prune=()=>{for(const [k,v]of saved)if(now()-v.time>3600000)saved.delete(k);};
 return {revision(token){return saved.get(token)?.revision||'';},touch(token){const v=saved.get(token);if(v)v.time=now();},
 async handle(req,send){
  const match=req.url.match(/^\/obs\/styles\/([a-f0-9]{64})$/);
  if(req.method==='GET'&&match){prune();const item=saved.get(match[1]);if(!item)send(404,{error:'外觀尚未同步，請重新開啟原管理頁'});else send(200,{revision:item.revision,styles:item.styles});return true;}
  if(req.method!=='POST'||req.url!=='/obs/styles')return false;
  try{if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw Error('只接受 JSON');let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>120000000)throw Error('外觀資源總量超過上限');chunks.push(Buffer.from(chunk));}const {writeToken,styles}=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!/^[a-f0-9]{64}$/.test(writeToken||''))throw Error('無效的發布金鑰');const token=createHash('sha256').update(writeToken).digest('hex'),clean=Theme.normalizeMap(styles),json=JSON.stringify(clean),revision=createHash('sha256').update(json).digest('hex');prune();const used=[...saved].reduce((sum,[k,v])=>sum+(k===token?0:v.size),0);if(used+json.length>192000000||!saved.has(token)&&saved.size>=16)throw Error('本機外觀快取已滿，請關閉多餘管理頁並重啟同步器');saved.set(token,{revision,styles:clean,time:now(),size:json.length});send(200,{revision,readToken:token});}catch(e){send(400,{error:e.message});}return true;
 }};
}
module.exports={createThemeBridge};
