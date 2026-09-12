'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../management-theme.js'),'utf8');
function setup({saved=null,search='',denied=false,matches=false}={}){
 const listeners={},media={matches,addEventListener:(name,fn)=>{media.changed=fn;}},document={documentElement:{dataset:{}}};
 vm.runInNewContext(source,{location:{search},URLSearchParams,document,matchMedia:()=>media,localStorage:{getItem(){if(denied)throw Error('denied');return saved;}},addEventListener:(name,fn)=>{listeners[name]=fn;}});
 return {listeners,media,dataset:document.documentElement.dataset};
}
test('management defaults dark, invalid or denied storage falls back safely',()=>{for(const options of [{},{saved:'invalid'},{denied:true}])assert.equal(setup(options).dataset.uiTheme,'dark');});
test('explicit light survives a dark system preference',()=>{const s=setup({saved:'light',matches:true});assert.equal(s.dataset.uiTheme,'light');s.media.changed();assert.equal(s.dataset.uiTheme,'light');});
test('system preference responds without writing OBS state',()=>{const s=setup({saved:'system'});assert.equal(s.dataset.uiTheme,'light');s.media.matches=true;s.media.changed();assert.equal(s.dataset.uiTheme,'dark');assert.equal(s.dataset.bsTheme,'dark');});
test('cross-tab preference updates and deletion restore default',()=>{const s=setup();s.listeners.storage({key:'other',newValue:'light'});assert.equal(s.dataset.uiTheme,'dark');s.listeners.storage({key:'yt-rank-show.management-theme',newValue:'light'});assert.equal(s.dataset.uiTheme,'light');s.listeners.storage({key:'yt-rank-show.management-theme',newValue:null});assert.equal(s.dataset.uiTheme,'dark');});
test('legacy OBS document remains untouched',()=>{const s=setup({search:'?obs=sc'});assert.deepEqual(s.dataset,{});assert.deepEqual(s.listeners,{});});
