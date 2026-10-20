const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

const MIXIN = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
function getMixinKey(orig){ return orig.split('').map((c,i)=>MIXIN[i]).join('').slice(0,32); }
function getKeys(){
  return new Promise((res,rej)=>{
    https.get('https://api.bilibili.com/x/web-interface/nav',{headers:{'User-Agent':'Mozilla/5.0','Referer':'https://www.bilibili.com'}},r=>{
      let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{const j=JSON.parse(d);const w=j.data.wbi_img;
        const img=w.img_url.split('/').pop().split('.')[0];const sub=w.sub_url.split('/').pop().split('.')[0];
        res(getMixinKey(img+sub));}catch(e){rej(e);}});
    }).on('error',rej);
  });
}
function search(kw,mixin){
  const params={keyword:kw,wts:Math.floor(Date.now()/1000)};
  const sorted=Object.keys(params).sort();
  const q=sorted.map(k=>k+'='+encodeURIComponent(params[k])).join('&');
  const w_rid=crypto.createHash('md5').update(q+mixin).digest('hex');
  const qs=q+`&w_rid=${w_rid}`;
  return new Promise((res,rej)=>{
    const req=https.get('https://api.bilibili.com/x/web-interface/wbi/search/all/v2?'+qs,{headers:{'User-Agent':'Mozilla/5.0','Referer':'https://www.bilibili.com'},timeout:10000},r=>{
      let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d));}catch(e){rej(e);}});
    });
    req.on('timeout',()=>{req.destroy(new Error('timeout'));});
    req.on('error',rej);
  });
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function norm(u){u=(u||'').trim();if(!u)return null;if(u.startsWith('//'))u='https:'+u;if(u.startsWith('http://'))u=u.replace('http://','https://');return u;}

function pickCover(j){
  const data=j.data||{};const result=(data.result||[]);
  for(const rt of ['media_ft','media_bangumi']){
    const g=result.find(x=>x.result_type===rt);
    const arr=(g&&g.data||[]).filter(x=>x&&(x.title||x.name));
    if(arr.length){const it=arr[0];const c=norm(it.cover);if(c)return c;}
  }
  return null;
}

const src=fs.readFileSync('app.js','utf8');
const titles=new Set();let m;
const reA=/title:"([^"]+)"/g;while((m=reA.exec(src)))titles.add(m[1]);
const reB=/"title":"([^"]+)"/g;while((m=reB.exec(src)))titles.add(m[1]);
const list=[...titles];
console.log('待处理影片数(去重):',list.length);

(async()=>{
  const mixin=await getKeys();
  const map={};let ok=0,fail=0;
  for(let i=0;i<list.length;i++){
    const kw=list[i];let cover=null;
    for(let attempt=0;attempt<2 && !cover;attempt++){
      try{const j=await search(kw,mixin);cover=pickCover(j);
        if(j.code && j.code!==0){cover=null;await sleep(700);}
      }catch(e){await sleep(900);}
    }
    if(cover){map[kw]=cover;ok++;}else{fail++;}
    if(i%25===0||i===list.length-1)console.log(`进度 ${i+1}/${list.length} 已取图=${ok} 未取=${fail}`);
    await sleep(260+Math.floor(Math.random()*120));
  }
  console.log('抓取完成 取图=',ok,' 未取(走SVG)=',fail);
  fs.writeFileSync('posters_backup.json',JSON.stringify(map,null,2),'utf8');
  console.log('已备份 URL 表 -> posters_backup.json');
  // 注入 POSTER_MAP
  const start=src.indexOf('const POSTER_MAP =');
  const end=src.indexOf('};',start)+2;
  const out=src.slice(0,start)+'const POSTER_MAP = '+JSON.stringify(map,null,2)+';\n'+src.slice(end);
  fs.writeFileSync('app.js',out,'utf8');
  console.log('已写入 app.js POSTER_MAP，条目数=',Object.keys(map).length);
})().catch(e=>{console.log('FATAL',e.message);process.exit(1);});
