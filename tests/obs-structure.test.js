'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),rank=require('../rank-output'),vm=require('node:vm'),fs=require('node:fs');
test('結構化輸出保留空格、空白行、Unicode 名稱並與純文字一致',()=>{
 const rows=[{displayName:'名稱 <img> 😀',value:3},{displayName:'乙',value:1}],s={showTitle:true,rankNameSpaces:2,nameValueSpaces:4,blankLines:2,maxNameLength:100};
 const view=rank.presentation(rows,'gift','monthly',s);
 assert.equal(rank.asText(view),rank.format(rows,'gift','monthly',s));
 assert.equal(view.rows[0].name,'名稱 <img> 😀');assert.equal(view.gap,'\n\n\n');
 assert.equal(view.rows[0].nameGap,'  ');assert.equal(view.rows[0].value,'3個');
});
test('OBS renderer 僅建立文字節點與 span，不使用 innerHTML',()=>{
 const make=tag=>({tag,children:[],dataset:{},append(...nodes){this.children.push(...nodes)},replaceChildren(...nodes){this.children=nodes},set innerHTML(v){throw Error('unsafe HTML')}});
 const doc={createElement:make,createTextNode:value=>({textContent:value})},out=make('pre');out.ownerDocument=doc;
 const ctx={module:{exports:{}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../obs-renderer'),'utf8'),ctx);
 const view=rank.presentation([{displayName:'<img src=x onerror=alert(1)>',value:1}],'gift','monthly',{showTitle:true,maxNameLength:100});
 ctx.module.exports.render(out,view,rank.asText(view),'gift');
 const row=out.children.find(x=>x.className==='rank-row rank-1');
 assert.equal(row.children.find(x=>x.className==='rank-name').textContent,'<img src=x onerror=alert(1)>');
 assert.equal(row.children.every(x=>x.tag==='span'),true);
 ctx.module.exports.render(out,undefined,'123','jewel');assert.equal(out.children[0].className,'jewel-value');assert.equal(out.children[0].textContent,'123');
});

