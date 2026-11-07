from pathlib import Path
from html import escape
import json, base64, zipfile
R=Path(__file__).resolve().parent
M=json.loads((R/'mockups/manifest.json').read_text())

TEMPLATE='''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Diddy · 13 Issue-Mockups</title><style>
*{box-sizing:border-box}body{margin:0;color:var(--foreground,#eee9f4);font-family:var(--font-sans,system-ui,sans-serif);font-size:13px;line-height:1.6}button,select,a.link{font:inherit}button,select,.link{border:1px solid var(--border,#39313f);color:var(--foreground,#eee9f4);background:var(--secondary,#251e2c);border-radius:9px;padding:9px 12px;min-height:40px}button{cursor:pointer;transition:filter 180ms ease-out}button:hover,.link:hover{filter:brightness(1.14)}button:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid #b48bea;outline-offset:3px}.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}select{min-width:210px;flex:1;max-width:100%}option{background:#241c2c;color:#eee}.kicker{font-size:11px;color:var(--muted-foreground,#a896b9);letter-spacing:.4px;margin-bottom:4px}.intro{font-size:12px;color:var(--muted-foreground,#a896b9);margin:0 0 10px}.primary{background:var(--primary,#9051db);color:var(--primary-foreground,#fff);border-color:transparent}.chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}.chips button{font-size:11px;min-height:30px;padding:4px 9px;border-radius:7px;background:transparent;color:var(--muted-foreground,#a896b9)}.chips button.active{color:#d6b5ff;background:#9862dc1c;border-color:#b689ee66}.image-frame{border-radius:var(--radius,12px);overflow:hidden;line-height:0}.image-frame img{width:100%;height:auto;display:block}.image-frame.zoomed{height:540px;overflow:auto}.image-frame.zoomed img{width:1440px;max-width:none}.meta{display:flex;gap:10px;align-items:center;margin:11px 0 15px;flex-wrap:wrap}.meta strong{font-size:13px}.meta span{font-size:11px;color:var(--muted-foreground,#a896b9)}.meta .link{margin-left:auto;font-size:11px;min-height:32px;padding:5px 10px;text-decoration:none}.notes{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.note{padding:16px;border:1px solid var(--border,#39313f);border-radius:var(--radius,12px);background:var(--card,#211a28)}.note b{font-size:11px}.note p{font-size:11px;line-height:1.7;color:var(--muted-foreground,#a896b9);margin:7px 0 0}.bottom{font-size:11px;color:var(--muted-foreground,#a896b9);margin:14px 0 0;line-height:1.7}.source a{color:inherit}#status{font-size:11px;color:var(--muted-foreground,#a896b9)}@media(max-width:500px){.notes{grid-template-columns:1fr}.toolbar button{font-size:11px;padding:8px 10px}select{width:100%;flex-basis:100%}.meta .link{margin-left:0}.chips{gap:5px}.chips button{font-size:10px}.image-frame.zoomed{height:420px}}@media(prefers-reduced-motion:reduce){button{transition:none}}
</style></head><body>
<div class="kicker">13 OFFENE ISSUES · 13 EINZELNE MOCKUPS · 1440 × 1080 PX</div><p class="intro">Dark Glass · Aurora-Licht · modulare Karten · kontrollierte Neon-Akzente · macOS-Nähe</p>
<div class="toolbar"><select id="choice" aria-label="Issue auswählen"></select><button id="save" class="primary">PNG speichern</button><button id="zip">Alle 13 als ZIP</button><button id="zoom" aria-pressed="false">Vergrößern</button></div>
<nav class="chips" id="chips" aria-label="Mockups nach Issue"></nav>
<div class="image-frame" id="frame"><img id="shot" width="1440" height="1080" alt="" src="__FIRST__"></div>
<div class="meta"><strong id="title"></strong><span id="category"></span><a id="issue-link" class="link" target="_blank" rel="noopener noreferrer">GitHub-Issue ↗</a></div>
<div class="notes" id="notes"></div><p class="bottom">Soll-Konzepte mit Beispieldaten, keine Screenshots einer fertigen Implementierung. Offene Architekturfragen und bekannte Grenzen sind pro Issue vermerkt. Die Vorlagen dienen als visuelle Referenz für die Umsetzung.</p><p class="bottom source">Quelle: <a href="https://github.com/Lndr2501/diddy/issues" target="_blank" rel="noopener noreferrer">offene Issues inklusive Kommentare und Referenzbilder</a> · gelesen am 07.11.2026</p><p id="status" role="status" aria-live="polite"></p>
<script>
const entries=__DATA__;
const $=id=>document.getElementById(id);let current=0;
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
function show(index){current=Number(index);const e=entries[current];$('choice').value=String(current);$('shot').src=e.src;$('shot').alt='Diddy – Issue #'+e.number+': '+e.title;$('title').textContent='#'+e.number+' · '+e.title;$('category').textContent=e.category;$('issue-link').href=e.url;$('notes').replaceChildren();e.notes.forEach((n,i)=>{const article=document.createElement('article');article.className='note';const b=document.createElement('b');b.textContent=(i+1)+'. '+n.title;const p=document.createElement('p');p.textContent=n.text;article.append(b,p);$('notes').append(article)});document.querySelectorAll('.chips button').forEach((b,i)=>{b.classList.toggle('active',i===current);b.setAttribute('aria-current',i===current?'true':'false')});$('status').textContent=''}
entries.forEach((e,i)=>{const o=document.createElement('option');o.value=i;o.textContent='#'+e.number+' · '+e.originalTitle;$('choice').append(o);const b=document.createElement('button');b.textContent='#'+e.number;b.title=e.title;b.addEventListener('click',()=>show(i));$('chips').append(b)});
$('choice').addEventListener('change',event=>show(event.target.value));
$('save').addEventListener('click',async()=>{try{const e=entries[current];download(await(await fetch(e.src)).blob(),'diddy-'+e.file+'.png');$('status').textContent='PNG-Download gestartet.'}catch(err){$('status').textContent='Download nicht verfügbar: '+err.message}});
$('zoom').addEventListener('click',()=>{const active=$('frame').classList.toggle('zoomed');$('zoom').setAttribute('aria-pressed',active);$('zoom').textContent=active?'Einpassen':'Vergrößern'});
// Tiny, dependency-free ZIP writer (STORE). PNGs are already compressed.
const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function header(size){const a=new Uint8Array(size);return[a,new DataView(a.buffer)]}
async function makeZip(){const chunks=[],central=[];let offset=0,centralSize=0;for(let i=0;i<entries.length;i++){const e=entries[i];$('status').textContent='ZIP wird erstellt: '+(i+1)+' / '+entries.length;const data=new Uint8Array(await(await fetch(e.src)).arrayBuffer());const name=new TextEncoder().encode('diddy-'+e.file+'.png');const crc=crc32(data);const[h,v]=header(30);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(12,0x5821,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);chunks.push(h,name,data);const[c,w]=header(46);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(14,0x5821,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);central.push(c,name);offset+=h.length+name.length+data.length;centralSize+=c.length+name.length}const[end,view]=header(22);view.setUint32(0,0x06054b50,true);view.setUint16(8,entries.length,true);view.setUint16(10,entries.length,true);view.setUint32(12,centralSize,true);view.setUint32(16,offset,true);download(new Blob([...chunks,...central,end],{type:'application/zip'}),'diddy-13-issue-mockups.zip');$('status').textContent='ZIP-Download mit allen 13 PNGs gestartet.'}
$('zip').addEventListener('click',async()=>{$('zip').disabled=true;try{await makeZip()}catch(err){$('status').textContent='ZIP nicht verfügbar: '+err.message}finally{$('zip').disabled=false}});
show(0);$('shot').addEventListener('load',()=>console.log('Preview image loaded',entries[current].number,$('shot').naturalWidth,$('shot').naturalHeight,'embedded:', $('shot').src.startsWith('data:')));
</script></body></html>'''

for mode in ['inline','portable','local']:
 entries=[]
 for e in M:
  e=dict(e)
  p=R/'mockups'/(e['file']+'.png')
  e['src']=('data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode() if mode=='portable' else str(p) if mode=='inline' else 'mockups/'+p.name)
  entries.append(e)
 doc=TEMPLATE.replace('__FIRST__',entries[0]['src']).replace('__DATA__',json.dumps(entries,ensure_ascii=False))
 (R/('gallery-'+mode+'.html')).write_text(doc)
with zipfile.ZipFile(R/'diddy-design-handoff.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted((R/'mockups').glob('*')): z.write(p,'mockups/'+p.name)
 for name in ['gallery-local.html','README.md']: 
  if (R/name).exists():z.write(R/name,name)
print('Gallery created. Inline payload:',(R/'gallery-inline.html').stat().st_size,'bytes')
