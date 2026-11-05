import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
// Imported for its side effect: beforeinstallprompt fires once and early, so the
// listener has to exist before React mounts (see src/lib/pwa.ts).
import './lib/pwa'
import App from './App.tsx'
import { TRPCProvider } from './providers/trpc'

// 2026-11-05: the shell is re-hashed on purpose. Between 23:05 and 23:16 the
// server answered compressed assets with content-type: text/plain, and every
// browser that accepted brotli cached that response under "immutable" for a
// year. The bytes were fine, the MIME type was not, so the module refused to
// execute from cache even after the server was fixed. A new content hash gives
// those clients a URL they have never poisoned. The dataset marker below exists
// only to guarantee this module hashes differently; it is also handy when
// telling two builds apart in devtools. Remove both once no client from that
// window can still be running.
document.documentElement.dataset.build = '2026-11-05-v58'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then((registration) => {
      // Check the deployment on every online launch instead of waiting for the
      // browser's periodic update. This also repairs an older broken shell.
      return registration.update()
    }).catch(() => {
      // The workspace still runs online; installation can be retried on the next load.
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <App />
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)
