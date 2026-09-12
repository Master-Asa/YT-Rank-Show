'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),Theme=require('../style-theme');
function context(disk,{fail=false}={}){
 const indexedDB={open(){
  const request={};
  queueMicrotask(()=>{
   request.result={close(){},transaction(){
    const tx={objectStore(){return {
     get(){const read={};queueMicrotask(()=>{read.result=disk.value;read.onsuccess();});return read;},
     put(value){queueMicrotask(()=>{if(fail){tx.error=Error('quota failure');tx.onerror();}else{disk.value=structuredClone(value);tx.oncomplete();}});}
    };}};
    return tx;
   }};
   request.onsuccess();
  });
  return request;
 }};
 const ctx={indexedDB,RankTheme:Theme,Event:class{},dispatchEvent(){},Promise,Error};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../style-store'),'utf8'),ctx);return ctx.StyleStore;
}
test('外觀按榜保存且重新載入恢復，不使用或覆寫紀錄儲存鍵',async()=>{const disk={};const first=context(disk);await first.ready;await first.save('sc',{enabled:true,font:'My Font'},undefined,'monthly');await first.save('gift',{enabled:true,theme:'paper'},undefined,'current');const restored=context(disk);await restored.ready;assert.equal(restored.styles['sc:monthly'].font,'My Font');assert.equal(restored.styles['gift:current'].theme,'paper');assert.equal(restored.styles.jewel,undefined);assert.equal(first.revision,2);});
test('外觀保存失敗保持舊設定；損壞讀取不覆寫',async()=>{const disk={value:{sc:{enabled:true,font:'Old Font'}}},store=context(disk,{fail:true});await store.ready;await assert.rejects(store.save('sc',{enabled:true,font:'New Font'},undefined,'monthly'),/quota/);assert.equal(store.styles.sc.font,'Old Font');assert.equal(disk.value.sc.font,'Old Font');const broken={value:{sc:{image:'invalid'}}},bad=context(broken);await assert.rejects(bad.ready);assert.equal(bad.loaded,false);assert.equal(broken.value.sc.image,'invalid');});
