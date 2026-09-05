// Service worker do Flash Ressolas — cacheia SOMENTE o "app shell" estatico para uso
// offline/instalação como PWA. NUNCA intercepta chamadas /api/: pedidos, status, preço
// e sincronização sempre vão direto pra rede, para nunca servir dado desatualizado ou
// travar uma gravação por causa de um cache velho.

const CACHE_NAME = "flash-ressolas-shell-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/css/app.css",
  "/js/public-src/app.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {
        // Falha ao pre-cachear nao deve impedir a instalacao do SW.
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Regra de ouro: qualquer coisa em /api/ passa direto pela rede, sem cache e sem
  // interceptacao. Isso garante dados sempre atuais e nunca bloqueia uma gravacao.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // offline: cai pro cache se existir

      // App shell: serve do cache imediatamente se disponivel (rapido, funciona offline),
      // atualizando em segundo plano.
      return cached || networkFetch;
    }),
  );
});
