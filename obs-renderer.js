(function(root){
'use strict';
const rankObservers=new WeakMap();
function alignRanks(out){
 const previous=rankObservers.get(out);previous?.disconnect();
 const numbers=[...out.querySelectorAll('.rank-number')];
 if(!numbers.length){out.style.removeProperty('--rank-column-width');return;}
 const icons=[...out.querySelectorAll('.rank-icon')];
 const measure=()=>{const iconWidth=Math.max(0,...icons.map(n=>n.offsetWidth));if(iconWidth>0&&out.style.getPropertyValue('--rank-icon-column-width')!==iconWidth+'px')out.style.setProperty('--rank-icon-column-width',iconWidth+'px');const width=Math.max(...numbers.map(n=>n.offsetWidth));if(width>0&&out.style.getPropertyValue('--rank-column-width')!==width+'px')out.style.setProperty('--rank-column-width',width+'px');};
 measure();
 if(typeof root.ResizeObserver==='function'){const observer=new root.ResizeObserver(measure);[...numbers,...icons].forEach(n=>observer.observe(n));rankObservers.set(out,observer);}
}
function render(out,view,fallback,kind){
 const doc=out.ownerDocument;
 if(!view){
  const span=doc.createElement('span');span.className=kind==='jewel'?'jewel-value':'output-message';span.textContent=fallback;out.replaceChildren(span);if(out.querySelectorAll&&out.style)alignRanks(out);return;
 }
 const nodes=[];
 if(view.title){const title=doc.createElement('span');title.className='rank-title';title.textContent=view.title;nodes.push(title);}
 view.rows.forEach((r,i)=>{
  if(nodes.length)nodes.push(doc.createTextNode(view.gap));
  const row=doc.createElement('span');row.className='rank-row rank-'+(i+1);row.dataset.rank=String(i+1);
  for(const [cls,text]of [['rank-number',r.rank],['rank-name-gap',r.nameGap],['rank-name',r.name],['rank-value-gap',r.valueGap],['rank-value',r.value]]){
   const part=doc.createElement('span');part.className=cls;
   if(cls==='rank-number'){const icon=doc.createElement('span'),number=doc.createElement('span');icon.className='rank-icon';number.className='rank-number-text';number.textContent=text;part.append(icon,number);}else part.textContent=text;
   row.append(part);
  }
  nodes.push(row);
 });
 out.replaceChildren(...nodes);
 if(out.querySelectorAll&&out.style)alignRanks(out);
}
if(typeof module==='object'&&module.exports)module.exports={render};else root.ObsRenderer={render};
})(typeof globalThis!=='undefined'?globalThis:this);
