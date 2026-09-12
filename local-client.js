'use strict';
(function(root){
 const base='http://127.0.0.1:11181';let credential='',pending;
 async function session(){
  if(!pending)pending=fetch(base+'/session',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(5000)}).then(async r=>{const v=await r.json();if(!r.ok||!/^[a-f0-9]{64}$/.test(v.credential||''))throw Error(v.error||'本機服務版本不符');credential=v.credential;return v;}).finally(()=>pending=null);
  return pending;
 }
 async function request(route,method='GET',body){
  if(!['/api','/styles','/fonts','/resolve','/updates'].includes(route)&&!/^\/fonts\/[a-f0-9]{64}$/.test(route))throw Error('不允許的本機路徑');
  if(!credential)await session();
  let response;
  for(let attempt=0;attempt<2;attempt++){
   response=await fetch(base+route,{method,credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json','X-YT-Session':credential},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(route==='/updates'?180000:60000)});
   if(response.status!==403||attempt)break;await session();
  }
  const value=await response.json();if(!response.ok)throw Error(value.error||'本機服務失敗');return value;
 }
 root.LocalRuntime={session,request};
})(globalThis);
