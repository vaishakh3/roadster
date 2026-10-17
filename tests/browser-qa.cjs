// Optional headless launcher for the same browser harness used during development.
const {chromium}=require('playwright-core');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const root=process.cwd();
async function main(){
 let browser,server;
 try{
  server=http.createServer((req,res)=>{
   const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
   if(!f.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
   if(!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}
   res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));
  });
  await new Promise(r=>server.listen(4178,'127.0.0.1',r));
  const bundled=process.platform==='linux'?require('@sparticuz/chromium'):null;
  const executablePath=process.env.CHROME_PATH||(bundled?await bundled.executablePath():process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined);
  browser=await chromium.launch({executablePath,headless:true,args:bundled?bundled.args.filter(a=>!a.includes('disable-web-security')&&!a.includes('allow-running-insecure-content')):[]});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto('http://127.0.0.1:4178/tests/browser.html');await page.click('#run');
  await page.waitForFunction(()=>/failed\.|FATAL/.test(document.querySelector('#report').textContent),{},{timeout:120000});
  const report=await page.locator('#report').innerText();fs.writeFileSync('tests/browser-qa-report.txt',report);console.log(report);
  assert(!/FAIL|FATAL/.test(report),'Browser harness failed');
 }finally{await browser?.close();await new Promise(r=>server?server.close(r):r());}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
