import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { defineConfig } from 'vitest/config'

const allowedPublicHosts = ['formulario.rodogarcia.com.br']

function secureLocalDevelopmentServer() {
  const certificatePath = process.env.ADC_LOCAL_HTTPS_PFX_PATH
  const certificatePassword = process.env.ADC_LOCAL_HTTPS_PFX_PASSWORD
  const apiTarget = process.env.ADC_LOCAL_API_TARGET

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

  return {
    host: 'localhost',
    allowedHosts: allowedPublicHosts,
    https: {
      pfx: readFileSync(certificatePath),
      passphrase: certificatePassword,
    },
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
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
