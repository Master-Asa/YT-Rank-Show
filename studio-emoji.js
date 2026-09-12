'use strict';
globalThis.RankStudioEmoji={
  mount($){
for(const i of [1,2,3]){const row=document.createElement('div');row.className='rank-icon-upload';row.innerHTML='<label class="field"><span>第 '+i+' 名 emoji／符號</span><input id="rankEmoji'+i+'" class="form-control" type="text" maxlength="48" placeholder="'+['🥇','🥈','🥉'][i-1]+'"></label><button type="button" id="defaultRankEmoji'+i+'" class="btn btn-link">使用 '+['🥇','🥈','🥉'][i-1]+'</button><button type="button" id="removeRankIcon'+i+'" class="btn btn-link">清除</button>';$('rankIconUploads').append(row);}
  },
  bind($,onChange){
for(const i of [1,2,3]){const changed=()=>{if($('rankEmoji'+i).value&&$('themeRankMode').value==='number')$('themeRankMode').value='both';onChange();};$('rankEmoji'+i).addEventListener('input',changed);$('defaultRankEmoji'+i).onclick=()=>{$('rankEmoji'+i).value=['🥇','🥈','🥉'][i-1];changed();};$('removeRankIcon'+i).onclick=()=>{$('rankEmoji'+i).value='';changed();};}
  }
};
