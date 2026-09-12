'use strict';
globalThis.updateRankCanvas=function(draft,$,canvasId){
 $('backgroundCustom').hidden=draft.backgroundFit!=='custom';
 $('themeBackgroundHeight').disabled=draft.backgroundLock;
 $('canvasDimensions').hidden=draft.canvasMode!=='fixed';
 for(const key of ['backgroundWidth','backgroundHeight','backgroundX','backgroundY'])$(canvasId(key)+'Value').textContent=key==='backgroundHeight'&&draft.backgroundLock?'自動':draft[key]+'%';
 const out=$('studioPreview'),frame=$('studioCanvasFrame'),sizer=$('studioCanvasSizer'),fixed=draft.canvasMode==='fixed';
 frame.classList.toggle('is-fixed',fixed);
 if(fixed)out.style.setProperty('font-size',draft.size+'em','important');else out.style.removeProperty('font-size');
 const scale=fixed?Math.min(1,frame.clientWidth/draft.canvasWidth):1;
 sizer.style.width=fixed?draft.canvasWidth+'px':'100%';sizer.style.height=fixed?draft.canvasHeight*scale+'px':'auto';
 out.style.transform=fixed?'scale('+scale+')':'';out.style.transformOrigin='top left';
 const overflow=out.scrollHeight>out.clientHeight+2||out.scrollWidth>out.clientWidth+2;
 $('studioCanvasNotice').textContent=fixed?'OBS 來源請設 '+draft.canvasWidth+' × '+draft.canvasHeight+' px · 預覽縮放 '+Math.round(scale*100)+'%'+(overflow?' · ⚠ 內容超出畫布，請增加尺寸或減少字級／列留白。':' · 目前內容可放入畫布。'):'隨內容變高：OBS 來源高度不會自動增加，請預留足夠高度。';
 $('studioCanvasNotice').dataset.overflow=String(fixed&&overflow);
};
