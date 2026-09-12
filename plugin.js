'use strict';
const path=require('node:path');
// OneComme reloads only the entry module; refresh our own dependency cache too.
for(const key of Object.keys(require.cache))if(key.startsWith(__dirname+path.sep)&&key!==__filename)delete require.cache[key];
const {createRuntime}=require('./src/runtime');
const {createResolverServer}=require('./scripts/resolver-server');
module.exports={
 name:'YT Rank Show',uid:'local.yt-rank-show.plugin',version:require('./app-version'),author:'Local',
 url:'http://localhost:11180/plugins/local.yt-rank-show.plugin/index.html',
 permissions:['comments','services','meta','meta.clear'],defaultState:{},runtimeReady:null,
 init(context,connected){
  if(this.runtimeReady)return;
  this.startError='';
  this.runtimeReady=(async()=>{
   // Never store event history under the host's publicly served plugin directory.
   const dataDir=path.join(process.env.APPDATA||path.dirname(context.dir),'YT-Rank-Show','data');
   const runtime=await createRuntime({...context,dataDir},connected);
   const updater=await require('./src/updater').createUpdater({dir:path.join(path.dirname(dataDir),'updates')});this.updater=updater;
   const server=createResolverServer({runtime,updater});
   try{
    const listen=()=>new Promise((resolve,reject)=>{const fail=e=>{server.removeListener('listening',ready);reject(e);},ready=()=>{server.removeListener('error',fail);resolve();};server.once('error',fail);server.once('listening',ready);server.listen(11181,'127.0.0.1');});
    try{await listen();}catch(e){if(e.code!=='EADDRINUSE')throw e;await require('./src/local-handoff').handoffLegacyHelper();await new Promise(resolve=>setTimeout(resolve,200));await listen();}
   }
   catch(e){updater.close();await runtime.close();throw Error('背景同步服務無法啟動：'+e.message+'。請關閉舊的本機同步器，再重新啟用此插件。');}
   this.runtime=runtime;this.server=server;this.confirmations=require('./src/native-confirmation').createConfirmationController(runtime);return runtime;
  })();
  this.runtimeReady.catch(e=>{this.startError=e.message;console.error('[YT Rank Show]',e.message);});
 },
 async subscribe(topic,...args){try{await(await this.runtimeReady).subscribe(topic,...args);}catch(e){this.startError=e.message;console.error('[YT Rank Show] 收錄失敗：',e.message);}},
 // The host REST request does not include a trustworthy peer identity. Never
 // expose records, settings, assets or management mutations on that LAN API.
 async request(){return {code:200,response:{background:!!this.runtime,version:this.version,localManagementOnly:true,startupError:!!this.startError}};},
 async destroy(){
  this.updater?.close();this.updater=null;this.confirmations?.close();this.confirmations=null;
  const pending=this.runtimeReady;this.runtimeReady=null;
  try{const runtime=await pending;this.confirmations?.close();this.confirmations=null;if(this.server){this.server.closeAllConnections();await new Promise(resolve=>this.server.close(resolve));}await runtime?.close();}
  catch(e){console.error('[YT Rank Show] 停止背景時發生錯誤：',e.message);}
  finally{this.server=null;this.runtime=null;}
 }
};
