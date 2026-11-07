import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('/root/.pi/agent/npm/node_modules/playwright-core');
const root=path.dirname(new URL(import.meta.url).pathname);
const manifest=JSON.parse(await fs.readFile(path.join(root,'mockups/manifest.json'),'utf8'));
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-gpu','--renderer-process-limit=1']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
 for(const entry of manifest){
  await page.goto('file://'+path.join(root,'mockups',entry.file+'.html'));
  await page.evaluate(()=>document.fonts.ready);
  const audit=await page.evaluate(()=>{
   const app=document.querySelector('.app');
   const bad=[];
   if(app){const edge=app.getBoundingClientRect().bottom;for(const e of document.querySelectorAll('.settings-content>.card,.settings-content>.two,.preview,.linux-aside,.wizard-bottom,.call-controls')) {const r=e.getBoundingClientRect();if(r.bottom>edge-1)bad.push({class:e.className,bottom:r.bottom,appBottom:edge});}}
   return {overflow:bad,horizontal:document.documentElement.scrollWidth>1440};
  });
  await page.screenshot({path:path.join(root,'mockups',entry.file+'.png')});
  console.log(JSON.stringify({issue:entry.number,...audit}));
 }
 await page.close();
} finally {await browser.close();}
