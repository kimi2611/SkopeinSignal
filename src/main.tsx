import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { TRPCProvider } from './providers/trpc'

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
