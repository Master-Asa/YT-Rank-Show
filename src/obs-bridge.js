'use strict';
const {createHash}=require('node:crypto');
function createObsBridge({now=Date.now}={}){
 const streams=new Map(),themes=require('./obs-theme-bridge').createThemeBridge({now});
 return async function(req,send,originAllowed){
  if(!req.url.startsWith('/obs/'))return false;
  if(!originAllowed){send(403,{error:'OBS 同步只接受 OneComme 網頁來源'});return true;}
  if(await themes.handle(req,send))return true;
  const match=req.url.match(/^\/obs\/output\/([a-f0-9]{64})$/);
  if(req.method==='GET'&&match){
   const saved=streams.get(match[1]);
   if(!saved){send(404,{error:'請先開啟原管理頁，等待 OBS 同步完成'});return true;}
   const age=now()-saved.updatedAt;
   if(age>15000){send(409,{error:'管理頁已停止同步，請回到原管理頁',age});return true;}
   send(200,{...saved.snapshot,styleRevision:themes.revision(match[1]),updatedAt:saved.updatedAt});return true;
  }
  if(req.method!=='POST'||req.url!=='/obs/publish'){send(404,{error:'Not found'});return true;}
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){send(415,{error:'只接受 JSON'});return true;}
  try{
   let size=0;const chunks=[];
   for await(const part of req){size+=part.length;if(size>262144)throw new Error('排行榜資料過大');chunks.push(part);}
   const {writeToken,snapshot}=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!/^[a-f0-9]{64}$/.test(writeToken||''))throw new Error('無效的發布金鑰');
   if(snapshot?.version!==1||!/^\d{4}-\d{2}$/.test(snapshot.month)||!snapshot.outputs||typeof snapshot.outputs!=='object')throw new Error('排行榜資料格式不正確');
   const outputs={};
   for(const period of ['current','monthly','all_time']){
    for(const kind of ['sc','gift','jewel'])for(const top of [3,5,10]){
     const key=period+'-'+kind+'-'+top,value=snapshot.outputs[key];
     if(value===undefined&&(period==='all_time'||kind==='jewel'))continue;
     if(typeof value!=='string'||value.length>8000)throw new Error('輸出格式不正確');
     outputs[key]=value;
    }
    const key=period+'-jewel',value=snapshot.outputs[key];
    if(value===undefined&&period==='all_time')continue;
    if(typeof value!=='string'||!/^\d*$/.test(value)||value.length>30)throw new Error('寶石格式不正確');
    outputs[key]=value;
   }
   const views={};
   if(snapshot.views!==undefined){
    if(!snapshot.views||typeof snapshot.views!=='object')throw new Error('排行結構格式不正確');
    for(const key of Object.keys(outputs).filter(k=>!k.endsWith('jewel'))){
     const view=snapshot.views[key];
     if(!view||typeof view.title!=='string'||view.title.length>200||!/^\n{1,3}$/.test(view.gap)||!Array.isArray(view.rows)||view.rows.length>10)throw new Error('排行結構格式不正確');
     const rows=view.rows.map(r=>{
      if(!r||typeof r.rank!=='string'||!/^\d{1,2}\.$/.test(r.rank)||typeof r.name!=='string'||r.name.length>1000||typeof r.value!=='string'||r.value.length>128||typeof r.nameGap!=='string'||!/^ {0,20}$/.test(r.nameGap)||typeof r.valueGap!=='string'||!/^ {0,20}$/.test(r.valueGap))throw new Error('排行欄位格式不正確');
      return {rank:r.rank,name:r.name,value:r.value,nameGap:r.nameGap,valueGap:r.valueGap};
     });
     views[key]={title:view.title,gap:view.gap,rows};
     if(require('../rank-output').asText(views[key])!==outputs[key])throw new Error('排行文字與結構不一致');
    }
   }
   const readToken=createHash('sha256').update(writeToken).digest('hex');
   for(const [key,value]of streams)if(now()-value.updatedAt>3600000)streams.delete(key);
   if(!streams.has(readToken)&&streams.size>=100)throw new Error('同步來源過多');
   streams.set(readToken,{updatedAt:now(),snapshot:{version:1,month:snapshot.month,channelId:String(snapshot.channelId||''),outputs,views}});
   themes.touch(readToken);
   send(200,{readToken,styleRevision:themes.revision(readToken),updatedAt:now()});
  }catch(e){send(400,{error:e.message});}
  return true;
 };
}
module.exports={createObsBridge};
