import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const{chromium}=require('/root/.pi/agent/npm/node_modules/playwright-core');
const root=path.dirname(new URL(import.meta.url).pathname);
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-gpu','--renderer-process-limit=1']});
try{
 const context=await browser.newContext({viewport:{width:728,height:1100},acceptDownloads:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+path.join(root,'gallery-portable.html'));
 let count=await page.locator('#choice option').count();
 for(let i=0;i<count;i++){
  await page.locator('#choice').selectOption(String(i));
  await page.locator('#shot').evaluate(img=>img.decode());
  const dim=await page.locator('#shot').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
  if(dim.width!==1440||dim.height!==1080)throw new Error('Wrong image dimensions for '+i);
 }
 await page.locator('#choice').selectOption('0');
 await page.locator('#zoom').click();if(await page.locator('#zoom').getAttribute('aria-pressed')!=='true')throw Error('Zoom missing');await page.locator('#zoom').click();
 let event=page.waitForEvent('download');await page.locator('#save').click();let d=await event;await d.saveAs(path.join(root,'test-single.png'));
 event=page.waitForEvent('download');await page.locator('#zip').click();d=await event;await d.saveAs(path.join(root,'test-gallery-download.zip'));
 await page.setViewportSize({width:390,height:1000});
 const mobile=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
 if(mobile.scroll>mobile.width)throw Error('Mobile horizontal overflow');
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({images:count,dimensions:'all 1440×1080',pngDownload:true,zipDownload:true,zoom:true,mobile,errors}));
 await context.close();
}finally{await browser.close()}
