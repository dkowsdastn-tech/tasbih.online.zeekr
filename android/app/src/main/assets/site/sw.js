/* Only cache this app's public shell; never APIs or remote audio. */
const PREFIX = 'nur-shell-' + encodeURIComponent(self.registration.scope) + '-';
const CACHE = PREFIX + 'v30.0';
const CORE = ['./index.html','./about.html','./help-kk.html','./help-en.html','./guide.html','./install.html','./faq.html','./css/styles.css?v=11','./css/refined.css?v=11','./css/mobile.css?v=30','./css/phone-layout.css?v=30','./css/polish.css?v=30','./css/release28.css?v=30','./js/nur.bundle.js?v=30','./js/mobile.js?v=30','./js/ui-text.js?v=30','./js/reading.js?v=30','./js/reading-kk.js?v=30','./manifest.webmanifest','./assets/icon.svg','./assets/brand.svg','./assets/focus.svg','./assets/quran.svg','./assets/sun.svg','./assets/kaaba.svg','./assets/book.svg','./assets/beads.svg','./assets/settings.svg','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  const request=event.request, url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==location.origin||!url.href.startsWith(self.registration.scope)||url.pathname.includes('/api/')) return;
  const relative=url.href.slice(self.registration.scope.length).split('?')[0].split('#')[0];
  if(request.mode==='navigate') {
    if(!['','index.html','about.html','help-kk.html','help-en.html','guide.html','install.html','faq.html'].includes(relative)) return;
    const fallback=relative && relative!=='index.html'?'./'+relative:'./index.html';
    event.respondWith(fetch(request).then(response=>{
      if(response.ok) { const copy=response.clone(); event.waitUntil(caches.open(CACHE).then(cache=>cache.put(fallback,copy))); }
      return response;
    }).catch(()=>caches.open(CACHE).then(cache=>cache.match(fallback))));
    return;
  }
  if(!CORE.some(path=>new URL(path,self.registration.scope).href===url.href)) return;
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(request))||fetch(request)));
});
