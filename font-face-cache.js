/* Bounded preview faces; selected board fonts are retained separately by name. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.createRankFaceCache=factory();})(globalThis,function(){
  'use strict';
  return function({add,remove,maxEntries=16,maxBytes=64*1024*1024,concurrency=3}){
    const entries=new Map(),pending=new Map(),jobs=[];let pinned=new Set(),running=0,bytes=0;
    function prune(){for(const [key,entry] of entries){if(entries.size<=maxEntries&&bytes<=maxBytes)break;if(pinned.has(entry.name))continue;entries.delete(key);bytes-=entry.bytes;remove(entry.face);}}
    function pump(){while(running<concurrency&&jobs.length){const job=jobs.shift();running++;job().finally(()=>{running--;pump();});}}
    function get(key,name,load){
      if(entries.has(key)){const hit=entries.get(key);entries.delete(key);entries.set(key,hit);return Promise.resolve(hit.face.family);}
      if(pending.has(key))return pending.get(key);
      const result=new Promise((resolve,reject)=>{jobs.push(async()=>{try{const value=await load();for(const [oldKey,old] of entries)if(old.name===name){entries.delete(oldKey);bytes-=old.bytes;remove(old.face);}entries.set(key,{...value,name});bytes+=value.bytes;add(value.face);prune();resolve(value.face.family);}catch(error){reject(error);}finally{pending.delete(key);}});});
      pending.set(key,result);pump();return result;
    }
    return {get,pin(names){pinned=new Set(names.slice(0,8));prune();},prune,stats(){return {entries:entries.size,bytes,pending:pending.size,running,pinned:pinned.size};}};
  };
});
