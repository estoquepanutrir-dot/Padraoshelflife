// =====================================================================
// SERVICE WORKER — SHELFLIFE
// =====================================================================
// Como forçar atualização do app nos clientes:
//   1) Altere o valor de CACHE_VERSION abaixo (ex: 'v3' -> 'v4')
//   2) Faça o deploy do novo index.html + sw.js
//   3) Os usuários abertos recebem a nova versão automaticamente:
//      - O index registra um update() periódico e ao voltar para a aba
//      - Quando detecta novo SW, manda skipWaiting()
//      - Ao ativar, o index escuta 'controllerchange' e dá reload()
// =====================================================================

const CACHE_VERSION = 'v4-2026-05-25';
const CACHE_NAME    = `shelflife-${CACHE_VERSION}`;

// Recursos do próprio app (mesma origem) que valem a pena ter em cache offline.
// NÃO inclua APIs externas (Apps Script, Sheets) — elas devem sempre ir à rede.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

// ---------------------------------------------------------------------
// INSTALL — baixa o app shell e força o novo SW a entrar em "waiting"
// ---------------------------------------------------------------------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL).catch(err => {
        // Se algum recurso falhar, não trava a instalação
        console.warn('[SW] Falha ao pré-cachear parte do app shell:', err);
      }))
  );
});

// ---------------------------------------------------------------------
// ACTIVATE — limpa caches antigos e assume controle das abas abertas
// ---------------------------------------------------------------------
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(
      nomes
        .filter(n => n.startsWith('shelflife-') && n !== CACHE_NAME)
        .map(n => {
          console.log('[SW] Removendo cache antigo:', n);
          return caches.delete(n);
        })
    );
    await self.clients.claim();
  })());
});

// ---------------------------------------------------------------------
// MESSAGE — recebe pedido do index para ativar imediatamente
// ---------------------------------------------------------------------
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ---------------------------------------------------------------------
// FETCH — estratégia por tipo de requisição
//   - APIs externas (Apps Script, etc): network-only, nunca cacheia
//   - Navegação (HTML): network-first com fallback ao cache (offline)
//   - Outros recursos da própria origem: stale-while-revalidate leve
// ---------------------------------------------------------------------
self.addEventListener('fetch', event => {
  const req = event.request;

  // Só intercepta GET; POST/PUT/DELETE passam direto
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const mesmaOrigem = url.origin === self.location.origin;

  // 1) Requisições para serviços externos (Google Apps Script, Sheets, CDNs de API)
  //    -> sempre rede, sem cache. Evita servir dados velhos.
  if (!mesmaOrigem) {
    return; // deixa o navegador tratar normalmente
  }

  // 2) Navegação de página (HTML) -> network-first
  const ehNavegacao =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (ehNavegacao) {
    event.respondWith((async () => {
      try {
        const resposta = await fetch(req, { cache: 'no-store' });
        // Atualiza o cache com a nova versão do HTML
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, resposta.clone()).catch(()=>{});
        return resposta;
      } catch (err) {
        // Offline: tenta o cache (a página que o usuário viu por último)
        const cacheada = await caches.match(req) || await caches.match('./index.html');
        if (cacheada) return cacheada;
        throw err;
      }
    })());
    return;
  }

  // 3) Outros recursos da própria origem (manifest, ícones, etc.)
  //    -> stale-while-revalidate: serve do cache rapidinho e atualiza em background
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cacheada = await cache.match(req);
    const fetchPromise = fetch(req).then(resposta => {
      if (resposta && resposta.status === 200 && resposta.type === 'basic') {
        cache.put(req, resposta.clone()).catch(()=>{});
      }
      return resposta;
    }).catch(() => cacheada);
    return cacheada || fetchPromise;
  })());
});
