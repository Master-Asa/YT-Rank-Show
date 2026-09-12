/* Management UI only. Never writes runtime settings or OBS appearance. */
'use strict';
(function(){
  if(new URLSearchParams(location.search).has('obs'))return;
  const key='yt-rank-show.management-theme',choices=['dark','light','system'];
  const media=matchMedia('(prefers-color-scheme: dark)');
  let preference='dark',select;
  try{const saved=localStorage.getItem(key);if(choices.includes(saved))preference=saved;}catch{}
  function apply(){
    const resolved=preference==='system'?(media.matches?'dark':'light'):preference;
    document.documentElement.dataset.uiTheme=resolved;
    document.documentElement.dataset.bsTheme=resolved;
    if(select)select.value=preference;
  }
  apply();
  media.addEventListener('change',()=>{if(preference==='system')apply();});
  addEventListener('storage',event=>{if(event.key===key){preference=choices.includes(event.newValue)?event.newValue:'dark';apply();}});
  addEventListener('DOMContentLoaded',()=>{
    const label=document.createElement('label');label.className='management-theme-control';
    const text=document.createElement('span');text.textContent='管理頁配色';
    select=document.createElement('select');select.id='managementTheme';select.className='form-select';
    for(const [value,name] of [['dark','深色'],['light','淺色'],['system','跟隨系統']]){
      const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);
    }
    select.onchange=()=>{preference=select.value;apply();try{localStorage.setItem(key,preference);}catch{label.title='瀏覽器未允許儲存；本次開啟仍可使用所選配色。';}};
    label.append(text,select);document.querySelector('.topbar').append(label);apply();
  });
})();
