const $=id=>document.getElementById(id);
const status=$('pdfStatus')||$('status')||{set textContent(value){console.info('[PDF Reader]',value)}};
let data=[],showZh=true,currentFile=null,pdfDoc=null,pdfBytes=null,renderScale=1,baseWidth=600,observer=null,renderTasks=new Map(),pageElements=[],pageMeta=[],pageBlocks=[],activeParagraph=-1,loadingToken=0;
let bilingualLayout=localStorage.getItem('paperreader-layout')==='side'?'side':'stack';
const storageKey='paperreader-v2-notes';
try{const old=JSON.parse(localStorage.getItem(storageKey)||'null');if(old?.data)data=old.data}catch(e){}
const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify({data}))}catch(e){}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function updateLayout(){const el=$('paragraphs');el.classList.toggle('layout-side',bilingualLayout==='side');el.classList.toggle('layout-stack',bilingualLayout!=='side');el.classList.toggle('zh-off',!showZh);$('layoutToggle').textContent=bilingualLayout==='side'?'↕ 切换上下对照':'⇄ 切换左右对照'}
$('layoutToggle').onclick=()=>{bilingualLayout=bilingualLayout==='side'?'stack':'side';localStorage.setItem('paperreader-layout',bilingualLayout);render()};
$('translateToggle').onclick=()=>{showZh=!showZh;$('translateToggle').textContent=showZh?'👁 隐藏中文':'👁 显示中文';render()};
function render(){updateLayout();const box=$('paragraphs');box.innerHTML=data.length?'':'<p class="muted">尚无文本。导入 PDF 后点击“提取论文文本”，或者先载入示例。</p>';
 const counts={title:0,body:0,caption:0,reference:0,other:0};data.forEach(p=>counts[p.type||'body']=(counts[p.type||'body']||0)+1);
 $('paragraphStats').textContent=`共 ${data.length} 段｜标题 ${counts.title}｜正文 ${counts.body}｜图表说明 ${counts.caption}｜参考文献 ${counts.reference}${counts.other?'｜其他 '+counts.other:''}`;
 data.forEach((p,i)=>{const div=document.createElement('article');div.className='para '+(p.mark?'mark-'+p.mark:'')+(activeParagraph===i?' selected':'');div.dataset.paragraph=i;div.innerHTML=`<b>${{title:'标题',body:'正文',caption:'图表说明',reference:'参考文献',other:'其他'}[p.type||'body']} · ${i+1}${p.page?' · 第'+p.page+'页':''}</b><p lang="en">${esc(p.en)}</p><div class="zh ${showZh?'':'hidden'}"><b>中文译文</b><p>${esc(p.zh||'（尚未翻译；点击编辑译文填写）')}</p></div><div class="colors"><button data-mark="yellow">🟨</button><button data-mark="green">🟩</button><button data-mark="blue">🟦</button><button data-mark="red">🟥</button><button data-mark="">清除</button><button data-edit="1">编辑译文</button></div>`;
 div.onclick=e=>{if(e.target.closest('button'))return;selectParagraph(i,true)};
 div.querySelectorAll('[data-mark]').forEach(b=>b.onclick=()=>{p.mark=b.dataset.mark;save();render()});div.querySelector('[data-edit]').onclick=()=>{const t=prompt('输入/粘贴该段中文译文：',p.zh||'');if(t!==null){p.zh=t;save();render()}};box.appendChild(div)})}
function selectParagraph(i,scroll){activeParagraph=i;document.querySelectorAll('.para').forEach(e=>e.classList.toggle('selected',+e.dataset.paragraph===i));updateOverlays();const p=data[i];if(scroll&&p?.page&&pageElements[p.page-1]){const page=pageElements[p.page-1],vp=$('pdfViewport');const scale=page.clientWidth/(pageMeta[p.page-1]?.width||page.clientWidth);vp.scrollTo({top:page.offsetTop-vp.offsetTop+(p.box?.y||0)*scale-25,behavior:'smooth'});queueRender(p.page-1)} }
$('sampleBtn').onclick=()=>{data=[{en:'This study investigates the electrochemical performance of lithium-ion batteries.',zh:'本研究考察锂离子电池的电化学性能。',type:'body',mark:'yellow'},{en:'The electrodes were characterized using X-ray diffraction and scanning electron microscopy.',zh:'采用 X 射线衍射和扫描电子显微镜对电极进行表征。',type:'body',mark:'green'},{en:'The sample retained 92% of its initial capacity after 200 cycles.',zh:'经过 200 次循环后，样品保持了初始容量的 92%。',type:'body',mark:'blue'}];save();render()};
$('addBtn').onclick=()=>{const en=prompt('输入英文原文：');if(en?.trim()){data.push({en:en.trim(),zh:'',mark:'',type:'body'});save();render()}};
$('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText(data.map(p=>p.en).join('\n\n'));alert('已复制英文原文')}catch(e){alert('复制失败，请检查浏览器权限')}};
$('clearBtn').onclick=()=>{if(!confirm('清除当前 PDF 和段落吗？'))return;loadingToken++;if(pdfDoc)pdfDoc.destroy();pdfDoc=null;currentFile=null;pdfBytes=null;pageElements=[];pageMeta=[];pageBlocks=[];renderTasks.clear();renderedPageNumbers.clear();pageRenderEpoch++;if(observer)observer.disconnect();$('pdfPages').innerHTML='';$('file').value='';$('fileName').textContent='尚未选择 PDF';$('pageIndicator').textContent='第 0 / 共 0 页';data=[];save();render()};
// PDF-only repair: local pdf.js, fail loudly if assets are missing.
const PDFJS_VERSION='6.4.299';
const PDFJS_MAIN='./vendor/pdf.mjs';
const PDFJS_WORKER='./vendor/pdf.worker.mjs';
let pdfWorkerOK=false,pdfWorkerMessage='尚未验证',pdfDebugError='',renderedPageNumbers=new Set(),pageRenderEpoch=0,scrollTimer=0,pdfLibrary=null;
function pdfDebug(){const out=$('pdfDebugText');if(!out)return;out.textContent=[
  'pdf.js 预期版本：'+PDFJS_VERSION,
  'pdf.js 实际版本：'+(pdfLibrary?.version||'未加载'),
  '主文件：'+PDFJS_MAIN,
  '主文件加载：'+(pdfLibrary?'成功':'失败 / 未加载'),
  'Worker 文件：'+PDFJS_WORKER,
  'Worker 加载：'+(pdfWorkerOK?'已验证成功':'未验证 / 失败')+'（'+pdfWorkerMessage+'）',
  'PDF 页数：'+(pdfDoc?.numPages||0),
  '已渲染页码：'+([...renderedPageNumbers].sort((a,b)=>a-b).join(', ')||'无'),
  '完整错误信息：'+(pdfDebugError||'无')].join('\n')}
function pdfFailure(where,err){pdfDebugError=where+'\n'+(err?.stack||String(err));console.error('[PDF Reader]',where,err);pdfDebug();$('pdfDebugPanel').open=true;status.textContent='❌ PDF 阅读器错误：'+(err?.message||err)+'；请展开 PDF 调试面板查看详情。'}
async function loadPdfjs(){
  // Only same-origin, bundled ES modules. Never use a browser PDF preview fallback.
  if(!pdfLibrary){
    try{pdfLibrary=await import(PDFJS_MAIN)}
    catch(err){throw new Error('本地 PDF.js 模块导入失败：'+PDFJS_MAIN+'；'+(err?.message||err),{cause:err})}
  }
  if(pdfLibrary.version!==PDFJS_VERSION)throw new Error('PDF.js 版本不匹配：实际 '+pdfLibrary.version+'，预期 '+PDFJS_VERSION);
  pdfLibrary.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
  // PDF.js owns the worker handshake. The stock pdf.worker.mjs does not
  // emit the custom {action:'ready',source:'worker'} message previously awaited.
  // Let getDocument() initialize its worker using GlobalWorkerOptions.workerSrc.
  pdfWorkerMessage='交由 PDF.js 初始化；等待 PDF 文档加载';
  pdfDebug();return pdfLibrary;
}
$('file').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(f.type!=='application/pdf'&&!f.name.toLowerCase().endsWith('.pdf')){alert('请选择 PDF 文件');return}currentFile=f;$('fileName').textContent=f.name;await openPdf(f)};
async function openPdf(f){
 const token=++loadingToken;pageRenderEpoch++;pdfDebugError='';pdfWorkerOK=false;renderedPageNumbers.clear();status.textContent='正在打开 PDF…';
 try{
  if(observer)observer.disconnect();if(pdfDoc)await pdfDoc.destroy();pdfDoc=null;
  $('pdfPages').innerHTML='';pageElements=[];pageMeta=[];renderTasks.clear();pdfDebug();
  const lib=await loadPdfjs();pdfBytes=new Uint8Array(await f.arrayBuffer());
  const doc=await lib.getDocument({data:pdfBytes.slice(),disableAutoFetch:true}).promise;
  if(token!==loadingToken){await doc.destroy();return}
  pdfDoc=doc;pdfWorkerOK=true;pdfWorkerMessage='PDF.js 已成功加载文档（Worker 由 PDF.js 管理）';renderScale=1;pageBlocks=[];
  for(let i=1;i<=doc.numPages;i++){
    const pg=await doc.getPage(i),v=pg.getViewport({scale:1});
    pageMeta.push({width:v.width,height:v.height});
    const el=document.createElement('div');el.className='pdf-page';el.dataset.page=i;
    el.innerHTML='<div class="page-placeholder">第 '+i+' / 共 '+doc.numPages+' 页（滑动时加载）</div><div class="paragraph-overlay"></div>';
    pageElements.push(el);$('pdfPages').appendChild(el);
  }
  const first=pageMeta[0];baseWidth=first?.width||600;
  layoutPages();setupObserver();updateCurrentPage();pdfDebug();
  status.textContent=`PDF 已打开：共 ${doc.numPages} 页。向下滚动浏览全部页面。`;
 }catch(err){pdfFailure('打开 PDF 失败',err)}
}
function fitWidth(){return Math.max(100,$('pdfViewport').clientWidth-16)}
function layoutPages(){
 if(!pdfDoc)return;pageRenderEpoch++;renderedPageNumbers.clear();
 const w=fitWidth()*renderScale;
 pageElements.forEach((el,i)=>{
  const m=pageMeta[i];el.style.width=w+'px';el.style.height=(w*m.height/m.width)+'px';
  el.querySelector('canvas')?.remove();el.querySelector('.pdf-text-layer')?.remove();
  if(!el.querySelector('.page-placeholder')){const ph=document.createElement('div');ph.className='page-placeholder';ph.textContent='第 '+(i+1)+' 页';el.prepend(ph)}
 });
 $('pdfPages').style.width=renderScale>1?`${w}px`:'100%';
 $('zoomLabel').textContent=Math.round(renderScale*100)+'%';
 updateOverlays();pdfDebug();if(observer)setupObserver();
}
function pageTop(el){return el.getBoundingClientRect().top-$('pdfPages').getBoundingClientRect().top}
function currentPageIndex(){
 const vp=$('pdfViewport');const center=vp.scrollTop+vp.clientHeight*.3;
 let closest=0,d=Infinity;
 pageElements.forEach((el,i)=>{const distance=Math.abs(pageTop(el)-center);if(distance<d){d=distance;closest=i}});return closest;
}
function updateCurrentPage(){if(!pdfDoc)return;const i=currentPageIndex();$('pageIndicator').textContent=`第 ${i+1} / 共 ${pdfDoc.numPages} 页`}
function setupObserver(){
 if(observer)observer.disconnect();const vp=$('pdfViewport');
 observer=new IntersectionObserver(entries=>{
  if(!pdfDoc)return;
  for(const e of entries){if(e.isIntersecting){const i=+e.target.dataset.page-1;for(let j=Math.max(0,i-1);j<=Math.min(pageElements.length-1,i+1);j++)queueRender(j)}}
  evictFarPages();pdfDebug();
 },{root:vp,rootMargin:'60% 0px',threshold:0});
 pageElements.forEach(e=>observer.observe(e));
 // Explicit initial render avoids iPhone Safari observer timing issues.
 queueRender(0);if(pageElements.length>1)queueRender(1);
}
function evictFarPages(){
 if(!pdfDoc)return;const near=currentPageIndex();
 pageElements.forEach((el,i)=>{
  if(Math.abs(i-near)>2&&!renderTasks.has(i)){el.querySelector('canvas')?.remove();el.querySelector('.pdf-text-layer')?.remove();renderedPageNumbers.delete(i+1);
   if(!el.querySelector('.page-placeholder')){const ph=document.createElement('div');ph.className='page-placeholder';ph.textContent='第 '+(i+1)+' 页';el.prepend(ph)}}
 });pdfDebug();
}
async function queueRender(i){
 if(!pdfDoc||i<0||i>=pageElements.length)return;
 const el=pageElements[i];if(el.querySelector('canvas')||renderTasks.has(i))return;
 const token=loadingToken,epoch=pageRenderEpoch,doc=pdfDoc;
 const task=(async()=>{
  try{
   const page=await doc.getPage(i+1);if(token!==loadingToken||epoch!==pageRenderEpoch)return;
   const width=el.clientWidth,view=page.getViewport({scale:width/pageMeta[i].width});
   const dpr=Math.min(window.devicePixelRatio||1,2);
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(view.width*dpr));canvas.height=Math.max(1,Math.ceil(view.height*dpr));
   canvas.style.width='100%';canvas.style.height='100%';
   const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('无法创建 canvas 2D context');
   await page.render({canvasContext:ctx,viewport:view,transform:[dpr,0,0,dpr,0,0]}).promise;
   if(token!==loadingToken||epoch!==pageRenderEpoch)return;
   el.querySelector('.page-placeholder')?.remove();el.prepend(canvas);renderedPageNumbers.add(i+1);pdfDebug();
   // Keep the existing transparent text-layer behavior unchanged.
   const tc=await page.getTextContent();if(token!==loadingToken||epoch!==pageRenderEpoch)return;
   const layer=document.createElement('div');layer.className='pdf-text-layer';const factor=el.clientWidth/pageMeta[i].width;
   for(const item of tc.items){if(!item.str?.trim())continue;const t=item.transform,span=document.createElement('span');span.textContent=item.str;
    const x=t[4]*factor,y=(pageMeta[i].height-t[5])*factor,font=Math.max(1,Math.hypot(t[2],t[3])*factor);
    span.style.cssText=`left:${x}px;top:${y-font}px;font-size:${font}px;font-family:sans-serif;`;layer.appendChild(span);
    const approx=span.getBoundingClientRect().width;if(approx>0&&item.width)span.style.transform=`scaleX(${item.width*factor/approx})`;
   }el.appendChild(layer);updateOverlays();
  }catch(err){pdfFailure('第 '+(i+1)+' 页 canvas 渲染失败',err)}
  finally{renderTasks.delete(i)}
 })();renderTasks.set(i,task);await task;
}
function setZoom(scale){renderScale=Math.min(3,Math.max(1,+scale.toFixed(2)));layoutPages()}
$('zoomIn').onclick=()=>setZoom(renderScale*1.25);
$('zoomOut').onclick=()=>setZoom(renderScale/1.25);
$('goPage').onclick=()=>{const n=Math.floor(+$('pageJump').value);if(!pdfDoc||n<1||n>pdfDoc.numPages)return alert('请输入有效页码');
 $('pdfViewport').scrollTo({top:pageTop(pageElements[n-1]),behavior:'smooth'});queueRender(n-1)};
$('pageJump').onkeydown=e=>{if(e.key==='Enter')$('goPage').click()};
$('pdfViewport').addEventListener('scroll',()=>{updateCurrentPage();clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{evictFarPages();const i=currentPageIndex();for(let j=Math.max(0,i-1);j<=Math.min(pageElements.length-1,i+1);j++)queueRender(j)},90)},{passive:true});
// Two-finger pinch zoom inside the PDF pane; zoom-out stops at fit-width.
let pinchStartDist=0,pinchStartZoom=1;
const vp=$('pdfViewport');
vp.addEventListener('touchstart',e=>{if(e.touches.length===2){pinchStartDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);pinchStartZoom=renderScale}},{passive:true});
vp.addEventListener('touchmove',e=>{if(e.touches.length===2&&pinchStartDist>0){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);const target=Math.min(3,Math.max(1,pinchStartZoom*d/pinchStartDist));$('zoomLabel').textContent=Math.round(target*100)+'%';vp.dataset.pinchZoom=target}},{passive:true});
vp.addEventListener('touchend',e=>{if(e.touches.length<2&&pinchStartDist){pinchStartDist=0;const z=Number(vp.dataset.pinchZoom);if(z)setZoom(z);delete vp.dataset.pinchZoom}},{passive:true});
window.addEventListener('resize',()=>{if(pdfDoc)layoutPages()});
$('debugBoxes').onchange=updateOverlays;
function updateOverlays(){pageElements.forEach((el,i)=>{const layer=el.querySelector('.paragraph-overlay');if(!layer)return;layer.innerHTML='';layer.classList.toggle('debug',$('debugBoxes').checked);const factor=el.clientWidth/(pageMeta[i]?.width||1);data.forEach((p,j)=>{if(p.page!==i+1||!p.box)return;const b=document.createElement('div');b.className='box'+(j===activeParagraph?' active':'');b.style.cssText=`left:${p.box.x*factor}px;top:${p.box.y*factor}px;width:${p.box.w*factor}px;height:${p.box.h*factor}px`;layer.appendChild(b)})})}
// Layout-aware PDF extraction: glyph coordinates -> lines -> columns -> paragraphs.
function extractLines(items,meta){const glyphs=items.filter(t=>t.str?.trim()&&t.transform).map(t=>({str:t.str,x:t.transform[4],y:meta.height-t.transform[5],w:t.width||0,h:Math.max(1,Math.hypot(t.transform[2],t.transform[3])),font:t.fontName||''})).filter(t=>t.y>=0&&t.y<=meta.height+5);glyphs.sort((a,b)=>a.y-b.y||a.x-b.x);const lines=[];for(const g of glyphs){let line=lines.findLast?.(l=>Math.abs(l.y-g.y)<Math.max(2,Math.min(l.h,g.h)*.35));if(!line){line={y:g.y,h:g.h,items:[]};lines.push(line)}line.items.push(g);line.h=Math.max(line.h,g.h)}return lines.map(l=>{l.items.sort((a,b)=>a.x-b.x);l.x=Math.min(...l.items.map(a=>a.x));l.right=Math.max(...l.items.map(a=>a.x+a.w));l.text='';let prev=null;for(const t of l.items){if(prev){const gap=t.x-(prev.x+prev.w);if(gap>Math.max(1.5,l.h*.19)&&!l.text.endsWith(' ')&&!t.str.startsWith(' '))l.text+=' '}l.text+=t.str;prev=t}l.text=l.text.replace(/\s+/g,' ').trim();return l}).filter(l=>l.text.length>1)}
function columnOrder(lines,meta){const W=meta.width;const interior=lines.filter(l=>l.y>meta.height*.11&&l.y<meta.height*.87&&l.right-l.x<W*.72);const left=interior.filter(l=>l.x<W*.46&&l.right<W*.61).length,right=interior.filter(l=>l.x>W*.46).length;const two=left>5&&right>5;const mid=W*.50;const label=l=>!two||l.right-l.x>W*.72?'full':l.x<mid?'left':'right';const sorted=lines.slice();if(two){sorted.sort((a,b)=>{const ca=label(a),cb=label(b);const ra=ca==='left'?0:ca==='right'?1:-1,rb=cb==='left'?0:cb==='right'?1:-1;if(ra!==rb){if(ra===-1||rb===-1)return a.y-b.y;return ra-rb}return a.y-b.y||a.x-b.x})}else sorted.sort((a,b)=>a.y-b.y||a.x-b.x);return{lines:sorted,two,label}}
function mergeText(a,b){return /[A-Za-z]-$/.test(a)?a.slice(0,-1)+b:a+' '+b}
function buildPageParagraphs(raw,pageNo,meta){const ordered=columnOrder(extractLines(raw.items,meta),meta),lines=ordered.lines;if(!lines.length)return[];const median=a=>{const x=a.slice().sort((a,b)=>a-b);return x[Math.floor(x.length/2)]||0};const bodySize=median(lines.filter(l=>l.y>meta.height*.12&&l.y<meta.height*.88).map(l=>l.h));const out=[];let group=[],refMode=false;
 const flush=()=>{if(!group.length)return;const text=group.reduce((a,l)=>a?mergeText(a,l.text):l.text,'').trim();const x=Math.min(...group.map(l=>l.x)),right=Math.max(...group.map(l=>l.right)),top=Math.min(...group.map(l=>l.y-l.h)),bottom=Math.max(...group.map(l=>l.y+l.h*.3));const font=median(group.map(l=>l.h));let type='body';if(/^(figure|fig\.?|table|scheme|图\s*\d)/i.test(text))type='caption';else if(/^(references|bibliography|参考文献)$/i.test(text)){type='title';refMode=true}else if(refMode||/^\[\d+\]\s/.test(text)||/^\d+\.\s+[A-Z][a-z]+,/.test(text))type='reference';else if(font>bodySize*1.22||group.length<=2&&text.length<95&&/^(abstract|introduction|conclusions?|results|discussion|methods|experimental|\d+(\.\d+)*\s+[A-Z])/i.test(text))type='title';out.push({en:text,zh:'',mark:'',type,page:pageNo,box:{x,y:top,w:right-x,h:bottom-top}});group=[]};
 let prev=null;for(const l of lines){const t=l.text;if((l.y<meta.height*.07||l.y>meta.height*.94)&&(/\bdoi\b|©|copyright|journal|volume|www\.|^\d{1,3}$|^page\s*\d+/i.test(t)||t.length<55))continue;if(/^(received|accepted|published|corresponding author|affiliation|department of|school of|institute of|university of|email\s*:)/i.test(t))continue;
 const col=ordered.label(l),prevCol=prev?ordered.label(prev):col;const gap=prev?l.y-prev.y:0;const sameCol=prev&&col===prevCol;const usual=prev?Math.max(prev.h,l.h):l.h;const indentation=prev&&l.x-prev.x>usual*1.6;const titleFont=l.h>bodySize*1.25;const prevTitle=prev&&prev.h>bodySize*1.25;const newBlock=!prev||!sameCol||gap>usual*1.85||gap<-.2||indentation||titleFont!==prevTitle||/^(figure|fig\.?|table|scheme|references|bibliography)/i.test(t);
 if(newBlock)flush();group.push(l);prev=l}flush();return out.filter(p=>p.en.length>3)}
$('extractBtn').onclick=async()=>{if(!pdfDoc){alert('请先导入 PDF');return}const token=loadingToken;status.textContent='正在按坐标分析论文段落…';try{const paragraphs=[];for(let i=1;i<=pdfDoc.numPages;i++){if(token!==loadingToken)return;status.textContent=`正在分析第 ${i} / ${pdfDoc.numPages} 页…`;const page=await pdfDoc.getPage(i);const content=await page.getTextContent();paragraphs.push(...buildPageParagraphs(content,i,pageMeta[i-1]));await new Promise(r=>setTimeout(r,0))}if(token!==loadingToken)return;data=paragraphs;activeParagraph=-1;save();render();updateOverlays();status.textContent=`提取完成：${pdfDoc.numPages} 页，共 ${data.length} 段。分类统计见右侧。可勾选“显示段落框”核对识别效果。`;}catch(err){status.textContent='提取失败：'+err.message}};
function sentences(){return data.map(x=>x.en).filter(Boolean)}
function summary(){const ss=sentences();if(!ss.length)return"请先导入并提取论文文本，或载入示例。";return"文献文本概览（规则提取，非 AI 总结）：\n"+"段落数："+ss.length+"\n\n代表性段落：\n"+ss.slice(0,6).map((x,i)=>`${i+1}. ${x.slice(0,220)}`).join("\n")}
$("outlineBtn").onclick=()=>{$("outline").textContent=summary()};
$("mindBtn").onclick=()=>{const target=$("mind");target.innerHTML="";if(!data.length){target.textContent="请先导入并提取文本。";return}const root=document.createElement("b");root.textContent="📘 论文内容";target.appendChild(root);data.slice(0,10).forEach((p,i)=>{const d=document.createElement("div");d.className="mind-item";d.textContent=`├─ ${i+1}. ${p.en.slice(0,100)}${p.en.length>100?"…":""}`;target.appendChild(d)})};
$("askBtn").onclick=()=>{const q=$("question").value.trim();if(!q){alert("请输入问题");return}$("answer").textContent="当前未连接 AI 后端，无法生成可靠的智能回答。\n\n你问的是："+q+"\n\n"+summary()+"\n\n提示：这是本地规则摘要，不是 AI 分析。"};
$("exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),data},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="PaperReaderAI_notes.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)};
$("resetBtn").onclick=()=>{if(confirm("确定删除当前浏览器保存的全部译文与标记？")){data=[];save();render()}};
render();
