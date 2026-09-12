'use strict';
(function(){
  if(new URLSearchParams(location.search).has('obs'))return;
  $('repairMembership').onclick=async()=>{
    const notice=$('membershipRepairNotice');
    const result=RecordPolicy.repairMembership(state.events);
    if(!result.repaired){text(notice,'沒有可安全修復的紀錄。數量或身份仍有真正衝突的事件會保留隔離，請下載含未計入紀錄的明細核對。');return;}
    if(!confirm('重新解析 '+result.repaired+' 筆會員紀錄？會先備份本頁完整事件，保留原始數值及重複副本；只有可由原留言確認的數量才修復，測試與頻道限制不會解除。'))return;
    try{
      if(connectionMode==='plugin'){const response=await api('POST',{action:'repairMembership'});state={...state,...response};render(true);text(notice,'背景已備份並重新解析會員紀錄；其他隔離規則仍保留。');return;}
      const backupKey=CACHE_KEY+'-before-membership-repair-'+Date.now();
      localStorage.setItem(backupKey,JSON.stringify(state.events));
      localStorage.setItem(CACHE_KEY,JSON.stringify(result.events));
      state.events=result.events;render(true);
      text(notice,'已重新解析 '+result.repaired+' 筆並保留修復前備份。重複副本不重複計數；測試、頻道與其他隔離仍有效。使用新版同步網址的 OBS 將自動跟上；請在「OBS 輸出」確認同步正常。');
    }catch(e){text(notice,'修復未完成，請勿清除網站資料：'+e.message);}
  };
})();
