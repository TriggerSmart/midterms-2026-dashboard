'use strict';

const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'_site');
const files=['index.html','styles.css','data.js','projections.js','app-core.js','live-sources.js','app.js','sample-results.json','.nojekyll'];

fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
for(const name of files){
  const src=path.join(root,name);
  if(!fs.existsSync(src)) throw new Error(`Missing static file: ${name}`);
  fs.copyFileSync(src,path.join(out,name));
}
fs.cpSync(path.join(root,'assets'),path.join(out,'assets'),{recursive:true});
console.log(`GitHub Pages artifact built at ${out}`);
