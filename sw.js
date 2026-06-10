// Mude esta versão sempre que subir alterações no GitHub (ex: v2, v3, v4)
const CACHE_VERSION = 'panutrir-force-update-v3';

// 1. Instalação: Força o novo Service Worker a pular a fila
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 2. Ativação: Varre o celular e apaga qualquer cache antigo imediatamente
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_VERSION) {
            console.log('[SW] Destruindo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim(); // Toma o controle das telas abertas na mesma hora
    })
  );
});

// 3. Interceptação: Estratégia "Rede Primeiro" (Network First)
// Sempre busca o HTML novo no GitHub. Se faltar internet no galpão, ele usa o cache.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response; 
      })
      .catch(() => {
        // Plano B: Retorna a versão salva se o dispositivo estiver offline
        return caches.match(event.request);
      })
  );
});
