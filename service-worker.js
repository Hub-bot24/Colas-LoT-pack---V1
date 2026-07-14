const CACHE_NAME = 'colas-lotpack-v126-durable-offline';
const APP_SHELL = [
  './','./index.html','./site-diagram-print.html','./colas_logo.png','./manifest.webmanifest',
  './app-config.js','./cloud-core.js','./offline-core.js','./version.txt'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(event.request.mode === 'navigate'){
    event.respondWith(fetch(event.request).then(response=>{
      const copy=response.clone(); caches.open(CACHE_NAME).then(cache=>cache.put('./index.html',copy)); return response;
    }).catch(()=>caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if(response && response.ok){ const copy=response.clone(); caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)); }
    return response;
  })));
});
self.addEventListener('sync', event => {
  if(event.tag === 'lotpack-submit-sync') event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>clients.forEach(client=>client.postMessage({type:'RETRY_PENDING_SUBMISSIONS'}))));
});
