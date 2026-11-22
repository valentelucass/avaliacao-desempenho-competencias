import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/roboto/wght.css'
import './index.css'
import '@fontsource-variable/figtree'
import '@astryxdesign/core/astryx.css'
import '@astryxdesign/theme-neutral/theme.css'
import App from './App.tsx'
import './evaluation-astryx.css'

document.documentElement.dataset.astryxTheme = 'neutral'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
