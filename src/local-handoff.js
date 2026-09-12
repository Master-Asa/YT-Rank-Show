'use strict';
const http=require('node:http');
// Fixed loopback destination only; no user URLs or event data leave this process.
function localRequest(route,credential){return new Promise((resolve,reject)=>{
 if(!['/health','/session','/handoff'].includes(route))return reject(Error('Invalid local route'));
 const req=http.request({hostname:'127.0.0.1',port:11181,path:route,method:route==='/handoff'?'POST':'GET',headers:{Origin:'http://127.0.0.1:11180','Content-Type':'application/json',...(credential?{'X-YT-Session':credential}:{})},timeout:2000},res=>{
  let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;if(body.length>100000)req.destroy(Error('Local response too large'));});res.on('end',()=>{try{if(res.statusCode<200||res.statusCode>=300)throw Error('Local HTTP '+res.statusCode);resolve(JSON.parse(body));}catch(e){reject(e);}});res.on('error',reject);
 });req.on('timeout',()=>req.destroy(Error('Local service timeout')));req.on('error',reject);req.end(route==='/handoff'?'{}':undefined);
});}
async function handoffLegacyHelper(){
 const health=await localRequest('/health');
 if(health.service!=='yt-rank-local-service'||health.version!==3||health.background!==false||(health.offline!==true&&health.publicChannelLookup!=='explicit-consent'))throw Error('11181 不是可接管的新版獨立同步器，沒有關閉它');
 const auth=await localRequest('/session');if(!/^[a-f0-9]{64}$/.test(auth.credential||''))throw Error('Invalid local session');
 await localRequest('/handoff',auth.credential);
}
module.exports={handoffLegacyHelper};
