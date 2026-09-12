'use strict';
// OpenType collection extraction: directory offsets are relative to the TTC file.
// https://learn.microsoft.com/en-us/typography/opentype/spec/otff
function extractCollection(bytes,family){
 const range=(o,n)=>{if(!Number.isInteger(o)||!Number.isInteger(n)||o<0||n<0||o+n>bytes.length)throw Error('TTC 字型資料不完整');};
 range(0,12);if(bytes.toString('ascii',0,4)!=='ttcf')return bytes;
 const count=bytes.readUInt32BE(8);if(!count||count>256)throw Error('TTC 字面數量不符');range(12,count*4);
 let chosen=null;
 for(let i=0;i<count;i++){
  const base=bytes.readUInt32BE(12+i*4);range(base,12);const n=bytes.readUInt16BE(base+4);if(!n||n>256)throw Error('TTC 資料表數量不符');range(base+12,n*16);
  const tables=[],tags=new Set();for(let j=0;j<n;j++){const p=base+12+j*16,tag=bytes.toString('ascii',p,p+4),offset=bytes.readUInt32BE(p+8),length=bytes.readUInt32BE(p+12);range(offset,length);if(tags.has(tag))throw Error('TTC 資料表重複');tags.add(tag);if(tag!=='DSIG')tables.push({tag,offset,length});}
  const names=tables.find(t=>t.tag==='name');let match=false;
  if(names&&names.length>=6){const start=names.offset,records=bytes.readUInt16BE(start+2),strings=bytes.readUInt16BE(start+4);if(6+records*12>names.length)throw Error('TTC 名稱資料不完整');for(let j=0;j<records;j++){const p=start+6+j*12,platform=bytes.readUInt16BE(p),id=bytes.readUInt16BE(p+6),len=bytes.readUInt16BE(p+8),off=bytes.readUInt16BE(p+10);if(![1,4,6,16].includes(id))continue;if(strings+off+len>names.length)throw Error('TTC 名稱範圍不正確');const b=Buffer.from(bytes.subarray(start+strings+off,start+strings+off+len));const name=(platform===0||platform===3)?(len%2?'':b.swap16().toString('utf16le')):b.toString('latin1');if(name===family)match=true;}}
  if(!match)continue;
  const os2=tables.find(t=>t.tag==='OS/2'),weight=os2?.length>=6?bytes.readUInt16BE(os2.offset+4):400,italic=os2?.length>=64?bytes.readUInt16BE(os2.offset+62)&1:0,score=Math.abs(weight-400)+(italic?1000:0);
  if(!chosen||score<chosen.score)chosen={base,tables,score};
 }
 if(!chosen)throw Error('找不到此 TTC 字族對應的字面；仍可按名稱選用');
 const tables=chosen.tables.sort((a,b)=>a.tag<b.tag?-1:a.tag>b.tag?1:0),n=tables.length;let size=12+n*16;
 for(const t of tables){t.dest=size;size+=(t.length+3)&~3;}if(size>32*1024*1024)throw Error('抽取的字面超過 32 MB');
 const out=Buffer.alloc(size);bytes.copy(out,0,chosen.base,chosen.base+4);out.writeUInt16BE(n,4);const power=2**Math.floor(Math.log2(n));out.writeUInt16BE(power*16,6);out.writeUInt16BE(Math.log2(power),8);out.writeUInt16BE(n*16-power*16,10);
 const checksum=b=>{let sum=0;for(let j=0;j<b.length;j+=4)sum=(sum+b.readUInt32BE(j))>>>0;return sum;};
 let head=null;tables.forEach((t,j)=>{const p=12+j*16;out.write(t.tag,p,4,'ascii');bytes.copy(out,t.dest,t.offset,t.offset+t.length);if(t.tag==='head'){if(t.length<12)throw Error('TTC head 不完整');head=t.dest;out.writeUInt32BE(0,head+8);}out.writeUInt32BE(checksum(out.subarray(t.dest,t.dest+((t.length+3)&~3))),p+4);out.writeUInt32BE(t.dest,p+8);out.writeUInt32BE(t.length,p+12);});
 if(head===null)throw Error('TTC 缺少 head');out.writeUInt32BE((0xB1B0AFBA-checksum(out))>>>0,head+8);return out;
}
module.exports={extractCollection};
