// Run by the Pages workflow once the real public URL is known.
const fs=require('node:fs'),path=require('node:path');
const base=new URL(process.argv[2]);
if(!['https:','http:'].includes(base.protocol)||base.username||base.password)throw Error('Expected a public HTTP(S) URL');
base.hash='';base.search='';base.pathname=base.pathname.replace(/\/+$/,'')+'/';
const esc=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for(const page of ['index.html','about.html']){
 const file=path.join(__dirname,page),url=new URL(page==='index.html'?'':page,base).href;
 let html=fs.readFileSync(file,'utf8').replace(/\s*<link rel="canonical"[^>]*>/g,'').replace(/\s*<meta property="og:url"[^>]*>/g,'');
 html=html.replace('</head>',`<link rel="canonical" href="${esc(url)}" />\n<meta property="og:url" content="${esc(url)}" />\n</head>`);
 fs.writeFileSync(file,html);
}
const today=new Date().toISOString().slice(0,10);
const urls=[base.href,new URL('about.html',base).href];
fs.writeFileSync(path.join(__dirname,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(url=>`  <url><loc>${esc(url)}</loc><lastmod>${today}</lastmod></url>`).join('\n')+'\n</urlset>\n');
fs.writeFileSync(path.join(__dirname,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml',base).href}\n`);
console.log('SEO configured for '+base.href);
