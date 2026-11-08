import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.mjs':'text/javascript'};
const port=Number(process.env.SST_PREVIEW_PORT||4173);
http.createServer(async(req,res)=>{
 try{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=pathname==='/'?'index.html':pathname.slice(1);
  if(pathname==='/__test__')file='index.html';
  if(pathname==='/operaciones/__test__')file='operaciones/index.html';
  if(pathname.endsWith('/')&&pathname!=='/')file+='index.html';
  const full=path.resolve(root,file);if(!full.startsWith(root+path.sep)||file.split(/[\\/]/).some(p=>p.startsWith('.')||p==='node_modules'||p==='supabase'))throw new Error();
  let bytes=await readFile(full);if(['/__test__','/operaciones/__test__'].includes(pathname))bytes=Buffer.from(bytes.toString().replace(/<script src="(?:\.\.\/)?cloud\.js(?:\?[^"]*)?"><\/script>/,`<script src="${pathname.startsWith('/operaciones/')?'../tests/operations-mock.js':'tests/mock-cloud.js'}"></script>`));
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}`));
