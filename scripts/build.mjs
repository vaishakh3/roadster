import { build } from 'esbuild';
import { readFile,writeFile,mkdir,copyFile,rm } from 'node:fs/promises';
const result=await build({entryPoints:['main.js'],bundle:true,minify:true,format:'iife',write:false});
const html=await readFile('index.html','utf8'),css=await readFile('style.css','utf8'),js=result.outputFiles[0].text;
const standalone=html.replace(/<link\b[^>]*href="style\.css"[^>]*>/,()=>`<style>${css}</style>`).replace(/<script\b[^>]*src="main\.js"[^>]*>\s*<\/script>/,()=>`<script>${js.replaceAll('</script','<\\/script')}</script>`);
await writeFile('Roadster-Flight-Lab.html',standalone);
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
await writeFile('dist/index.html',standalone);await copyFile('vendor/THREE-LICENSE.txt','dist/THREE-LICENSE.txt');await copyFile('assets/LICENSE.txt','dist/ASSET-LICENSE.txt');
console.log('Built identical standalone and hosted HTML: '+Buffer.byteLength(standalone)+' bytes, no runtime asset requests.');
