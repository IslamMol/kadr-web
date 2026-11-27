// Cache only the app shell; user video, audio, projects and external model
// requests are never stored by this service worker.
const prefix = 'kadr-shell:' + self.registration.scope + ':';
const cacheName = prefix + '6013200ce8b34486';
const root = new URL('./',self.registration.scope).href;
const shell = ['', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'].map(x => new URL(x,root).href);
self.addEventListener('install',event => event.waitUntil(
  caches.open(cacheName).then(cache => cache.addAll(shell)).then(() => self.skipWaiting())
));
self.addEventListener('activate',event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim())
));
self.addEventListener('fetch',event => {
  const request=event.request, url=new URL(request.url);
  if(request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(root)) return;
  if(request.mode === 'navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request,{cache:'no-cache'});
        if(response.ok){const cache=await caches.open(cacheName);await cache.put(root,response.clone());}
        return response;
      }catch{
        const cached=await caches.match(root);
        return cached || new Response('Нет сети. Открой приложение в интернете хотя бы один раз.',
          {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
      }
    })());
  }else if(shell.includes(url.href)){
    event.respondWith(caches.match(request).then(hit => hit || fetch(request)));
  }
});
