/* Shared currency rules for the background collector and browser fallback. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.RankCurrency=factory();
})(globalThis,function(){
  'use strict';
  const definitions=[
    ['TWD','新台幣',1,['NT$','NTD']],['USD','美金',31.5,['US$']],
    ['JPY','日圓',0.21,['¥','￥']],['HKD','港幣',4.05,['HK$']],
    ['CNY','人民幣',4.35,['RMB','CN¥']],['EUR','歐元',34.5,['€']],['KRW','韓元',0.024,['₩']],
    // New defaults are reference estimates, not live rates. See docs/CURRENCIES.md.
    ['MYR','馬來幣',7.5415,['RM']],['SGD','新加坡幣',24.9,['S$','SG$']],
    ['THB','泰銖',0.9562,['฿']],['IDR','印尼盾',0.00173,['RP']],['PHP','菲律賓披索',0.5082,['₱']],
    ['AUD','澳幣',22.2675,['A$','AU$']],['CAD','加幣',22.375,['C$','CA$']],['GBP','英鎊',42.21,['£']]
  ];
  const labels=Object.freeze(Object.fromEntries(definitions.map(([code,label])=>[code,label])));
  const defaultRates=Object.freeze(Object.fromEntries(definitions.map(([code,,rate])=>[code,rate])));
  const addedCurrencies=Object.freeze(definitions.slice(7).map(([code])=>code));
  const symbols=Object.freeze(Object.fromEntries(definitions.flatMap(([code,,,aliases])=>[code,...aliases].map(alias=>[alias,code]))));
  const token=value=>String(value??'').replace(/\s+/g,'').toUpperCase();
  const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // Longest aliases first: RM must not consume RMB; S$ must not become bare $.
  const units=[...Object.keys(symbols),'$'].sort((a,b)=>b.length-a.length).map(value=>escape(value).replace(/\\\$/g,'\\s*\\$')).join('|');
  const amountPattern='-?[0-9][0-9,.]*';
  const prefix=new RegExp('^('+units+')\\s*('+amountPattern+')(?:\\s*('+units+'))?$','i');
  const suffix=new RegExp('^('+amountPattern+')\\s*('+units+')$','i');
  function numberValue(value){
    if(value===null||value===undefined)return null;
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    if(typeof value!=='string')return null;
    const raw=value.trim();
    if(!/^-?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?$/.test(raw))return null;
    const n=Number(raw.replace(/,/g,''));return Number.isFinite(n)?n:null;
  }
  function normalizeUnit(unit,dollarCurrency='TWD'){
    const raw=token(unit);
    if(raw==='$')return {currency:['TWD','USD'].includes(dollarCurrency)?dollarCurrency:null,source:'single-dollar-setting'};
    const currency=symbols[raw]||null;return {currency,source:currency?'structured-unit':'unknown-unit'};
  }
  function parsePaidText(text,dollarCurrency='TWD'){
    const raw=String(text??'').replace(/[\u00a0\u202f]/g,' ').trim();
    const head=raw.match(prefix),tail=head?null:raw.match(suffix);
    if(!head&&!tail)return {amount:null,currency:null,source:'unparsed-paid-text'};
    const unit=head?head[1]:tail[2],amountText=head?head[2]:tail[1],decision=normalizeUnit(unit,dollarCurrency);
    // "Rp 10.000" may mean ten or ten thousand; require a structured amount instead of guessing.
    const amount=/^[1-9][0-9]{0,2}\.[0-9]{3}$/.test(amountText)?null:numberValue(amountText);
    if(head?.[3]&&normalizeUnit(head[3],dollarCurrency).currency!==decision.currency)return {amount,currency:null,source:'conflicting-paid-text'};
    if(amount===null)return {amount:null,currency:decision.currency,source:'paid-text-invalid-amount'};
    return {amount,currency:decision.currency,source:decision.currency?'paid-text'+(token(unit)==='$'?'-single-dollar-setting':''):'unknown-paid-text'};
  }
  function details(data={},settings={}){
    const paidText=String(data.paidText??data.priceText??data.amountText??'');
    const originalCurrency=String(data.unit??data.currency??'');
    const parsed=parsePaidText(paidText,settings.dollarCurrency);
    let amount=numberValue(data.price??data.amount),decision=normalizeUnit(originalCurrency,settings.dollarCurrency);
    if(amount===null)amount=parsed.amount;
    // Explicit structured codes win. A bare $ / yen symbol may be clarified by paidText.
    const ambiguous=['$','¥','￥'].includes(token(originalCurrency));
    if(!token(originalCurrency)||(ambiguous&&parsed.currency&&!parsed.source.includes('single-dollar'))){
      decision={currency:parsed.currency,source:parsed.source};
    }
    const configured=settings.rates||defaultRates,rawRate=decision.currency?numberValue(configured[decision.currency]):null;
    const rate=rawRate!==null&&rawRate>0&&rawRate<1000000?rawRate:null;
    const product=amount!==null&&amount>0&&rate!==null?amount*rate:null;
    const amountTwd=product!==null&&Number.isFinite(product)&&product<=Number.MAX_SAFE_INTEGER/100?Math.round(product*100)/100:null;
    return {originalPaidText:paidText,originalAmount:amount,originalCurrency,normalizedCurrency:decision.currency,amountTwd,exchangeRate:rate,currencyDecisionSource:decision.source};
  }
  function revalue(event,settings){
    if(!['superchat','supersticker'].includes(event.eventType))return event;
    const unit=event.originalCurrency||(!event.originalPaidText?event.normalizedCurrency:'');
    const money=details({price:event.originalAmount,unit,paidText:event.originalPaidText},settings);
    const next={...event,...money};
    // Preserve raw evidence and all IDs, exclusions, reset/test flags and audit reasons.
    if(Object.hasOwn(event,'originalCurrency'))next.originalCurrency=event.originalCurrency;
    return JSON.stringify(next)===JSON.stringify(event)?event:next;
  }
  function recalculate(events,settings,{newOnly=false}={}){
    let changed=false;
    const result=events.map(event=>{
      if(newOnly&&event.normalizedCurrency&&Object.hasOwn(defaultRates,event.normalizedCurrency)&&(!addedCurrencies.includes(event.normalizedCurrency)||(event.amountTwd>0&&event.exchangeRate>0)))return event;
      const next=revalue(event,settings);
      if(newOnly&&(!addedCurrencies.includes(next.normalizedCurrency)||(event.normalizedCurrency&&event.amountTwd>0&&event.exchangeRate>0)))return event;
      if(next!==event)changed=true;return next;
    });
    return {events:changed?result:events,changed};
  }
  return Object.freeze({labels,defaultRates,addedCurrencies,numberValue,normalizeUnit,parsePaidText,details,revalue,recalculate});
});
