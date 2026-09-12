/* Presentation only: keep original controls, listeners, consent and error regions. */
'use strict';
(function(){
 if(new URLSearchParams(location.search).has('obs'))return;
 const get=id=>document.getElementById(id);
 function help(parent,nodes,title='使用說明'){
  nodes=nodes.filter(Boolean);if(!nodes.length)return;
  const box=document.createElement('details'),summary=document.createElement('summary');box.className='section-help';summary.textContent=title;box.append(summary,...nodes);parent.append(box);
 }
 function region(node,title){node.classList.add('ui-region');if(title){const h=document.createElement('h3');h.className='region-heading';h.textContent=title;node.prepend(h);}return node;}
 const setup=get('channelSetup'),old=setup.parentElement,manager=get('sessionManager');
 const native=get('nativePromptEnabled').closest('section'),auto=get('autoChannelUrl').closest('section');
 const manualStart=[...old.children].find(n=>n.tagName==='H3'&&n!==old.querySelector('h3'));
 const manual=document.createElement('details');manual.id='manualLiveSettings';manual.className='ui-region manual-region';
 const manualSummary=document.createElement('summary');manualSummary.textContent='手動加入直播';manual.append(manualSummary);
 for(let node=manualStart;node&&node!==manager;){const next=node.nextSibling;manual.append(node);node=next;}
 manualStart.remove();manual.querySelector('p').textContent='請自行確認影片屬於此頻道；不會線上驗證。';
 manual.querySelector('#publicResolveNotice').hidden=true; // Redundant fixed explanation, not an error target.
 const channel=region(document.createElement('section'));channel.id='channelRegion';channel.append(setup);
 setup.querySelector('summary').textContent='統計頻道 · 設定／更換';setup.querySelector('.creator-help').textContent='@名稱需先查詢；UC ID 可直接儲存。';
 region(native);native.id='nativePromptRegion';native.querySelector('h3').textContent='新直播提醒';
 const nativeExplanation=native.querySelector('p:not([id])');help(native,[nativeExplanation],'提醒方式');
 const warning=document.createElement('p');warning.className='region-caution';warning.textContent='確認視窗可能出現在 OBS 螢幕擷取中。';native.querySelector('label').after(warning);
 region(auto);auto.id='autoChannelRegion';auto.querySelector('h3').textContent='自動追蹤直播';
 const autoNotes=[...auto.querySelectorAll('p:not([id])')];help(auto,autoNotes,'連線方式');const instruction=document.createElement('p');instruction.className='region-hint';instruction.textContent='複製頻道網址，貼到 OneComme 連線。';auto.querySelector('h3').after(instruction);
 const layout=document.createElement('div');layout.className='channel-region-grid';layout.append(channel,auto,native,manual);old.replaceWith(layout,manager);region(manager);manager.querySelector('h3').classList.add('region-heading');
 const toggleManual=()=>{if(get('channelLiveChoice').value)get('manualLiveSettings').open=true;};get('channelLiveChoice').addEventListener('change',toggleManual);
 // Brief headings do not need a second line explaining their own purpose.
 for(const id of ['events','records','exports','ranking','settings','appearance'])document.querySelector('#'+id+' .panel-heading p')?.remove();
 // CSV export has its own card; backup and destructive actions stay separate.
 const exports=get('exports'),csv=region(document.createElement('section'),'匯出報表');csv.id='csvExportRegion';const grid=exports.querySelector('.form-grid');grid.before(csv);csv.append(grid,get('exportSelectionHint'),get('downloadCsv'),get('exportNotice'));
 for(const node of exports.querySelectorAll(':scope > details'))region(node);
 region(get('historyImportPanel'));region(get('storageManagement'));
 const storageHelp=get('storageManagement').querySelector('p:not([id])');help(get('storageManagement'),[storageHelp],'儲存方式');
 const form=get('settingsForm');for(const node of form.querySelectorAll(':scope > details'))region(node);
 const mode=get('recordMode').closest('label'),modeRegion=region(document.createElement('section'),'紀錄用途');mode.before(modeRegion);modeRegion.append(mode);
 // Leave privacy consent and file/format limits beside their corresponding actions.
 get('channelLookupPrivacy').textContent='查詢會連線 YouTube，傳送頻道網址與 IP；不傳紀錄或 OBS 金鑰。';
 get('channelLookupConsent').parentElement.lastChild.textContent='同意本次連線查詢 YouTube';
 get('nativePromptEnabled').parentElement.lastChild.textContent='遇到未確認直播時，顯示確認視窗';
 get('copyAutoChannelUrl').textContent='複製網址';
 get('sessionLookupConsent').parentElement.lastChild.textContent='同意連線 YouTube 查詢標題與頻道';
 const sessionPrivacy=get('sessionLookupConsent').parentElement.nextElementSibling;if(sessionPrivacy?.tagName==='P')sessionPrivacy.textContent='只傳影片網址與 IP，不傳支持紀錄。';
 get('historyImportPanel').querySelector(':scope > p').textContent='選取 OneComme 舊紀錄，核對後匯入。';
})();
