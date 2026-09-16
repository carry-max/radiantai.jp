self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Authentication, videos and analysis responses remain network-only. This worker
// exists so the HTTPS site can be installed as a Windows app without persisting
// private review data in an offline cache.
