import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { defineConfig } from 'vitest/config'

const allowedPublicHosts = ['formulario.rodogarcia.com.br']
const publicPreviewHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "style-src-elem 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://api-formulario.rodogarcia.com.br",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'self'",
  ].join('; '),
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

function publicPreviewHost(origin: string | undefined) {
  if (!origin) {
    return undefined
  }

  const parsedOrigin = new URL(origin)
  const host = parsedOrigin.hostname.toLowerCase()
  if (
    parsedOrigin.protocol !== 'https:' ||
    parsedOrigin.port ||
    parsedOrigin.username ||
    parsedOrigin.password ||
    parsedOrigin.pathname !== '/' ||
    parsedOrigin.search ||
    parsedOrigin.hash ||
    !/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.devtunnels\.ms$/.test(host)
  ) {
    throw new Error(
      'ADC_LOCAL_PUBLIC_PREVIEW_ORIGIN deve ser a origem HTTPS exata de um Dev Tunnel, sem caminho, porta ou credenciais.',
    )
  }

  return host
}

function secureLocalDevelopmentServer() {
  const certificatePath = process.env.ADC_LOCAL_HTTPS_PFX_PATH
  const certificatePassword = process.env.ADC_LOCAL_HTTPS_PFX_PASSWORD
  const apiTarget = process.env.ADC_LOCAL_API_TARGET
  const previewHost = publicPreviewHost(process.env.ADC_LOCAL_PUBLIC_PREVIEW_ORIGIN)

  if (!certificatePath && !certificatePassword && !apiTarget) {
    return undefined
  }

  if (!certificatePath || !certificatePassword || !apiTarget) {
    throw new Error(
      'A execução HTTPS local exige ADC_LOCAL_HTTPS_PFX_PATH, ADC_LOCAL_HTTPS_PFX_PASSWORD e ADC_LOCAL_API_TARGET.',
    )
  }

  const parsedTarget = new URL(apiTarget)
  if (
    parsedTarget.protocol !== 'https:' ||
    !['localhost', '127.0.0.1', '::1'].includes(parsedTarget.hostname)
  ) {
    throw new Error('ADC_LOCAL_API_TARGET deve apontar para uma API HTTPS de loopback.')
  }

  const https = previewHost
    ? undefined
    : {
        pfx: readFileSync(certificatePath),
        passphrase: certificatePassword,
      }

  return {
    host: 'localhost',
    allowedHosts: [...allowedPublicHosts, ...(previewHost ? [previewHost] : [])],
    ...(https ? { https } : {}),
    proxy: {
      '/api': {
        target: parsedTarget.origin,
        changeOrigin: true,
        // O certificado efêmero é confiado somente pelo perfil local; o proxy não
        // é habilitado para destinos fora do loopback, validados acima.
        secure: false,
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: secureLocalDevelopmentServer(),
  preview: {
    allowedHosts: allowedPublicHosts,
    headers: publicPreviewHeaders,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
