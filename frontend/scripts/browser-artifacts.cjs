const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const frontendRoot = path.resolve(__dirname, '..')
let artifactDirectory

function resolvedTarget(directory) {
  let existing = path.resolve(directory)
  const remaining = []
  while (!fs.existsSync(existing)) {
    remaining.unshift(path.basename(existing))
    const parent = path.dirname(existing)
    if (parent === existing) throw new Error('Diretório de evidências inválido')
    existing = parent
  }
  return path.resolve(fs.realpathSync(existing), ...remaining)
}

function outsideServedDist(directory) {
  const resolved = resolvedTarget(directory)
  const served = resolvedTarget(path.join(frontendRoot, 'dist'))
  const relative = path.relative(served, resolved)
  if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) {
    throw new Error('Verificações não podem gravar dentro do frontend/dist servido')
  }
  return resolved
}

function assertArtifactName(name) {
  if (
    path.basename(name) !== name ||
    ['.', '..'].includes(name) ||
    !/^[A-Za-z0-9._-]+$/.test(name)
  ) {
    throw new Error('Nome de evidência inválido')
  }
}

function browserArtifactPath(name) {
  assertArtifactName(name)
  if (!artifactDirectory) {
    artifactDirectory = process.env.ADC_BROWSER_ARTIFACT_DIRECTORY
      ? outsideServedDist(process.env.ADC_BROWSER_ARTIFACT_DIRECTORY)
      : fs.mkdtempSync(path.join(outsideServedDist(os.tmpdir()), 'adc-browser-artifacts-'))
    fs.mkdirSync(artifactDirectory, { recursive: true })
  }
  return safeBrowserArtifactPath(artifactDirectory, name)
}

function safeBrowserArtifactPath(directory, name) {
  assertArtifactName(name)
  const selectedDirectory = path.resolve(directory)
  if (outsideServedDist(selectedDirectory) !== selectedDirectory) {
    throw new Error('O diretório de evidências mudou após sua seleção')
  }
  const target = path.join(selectedDirectory, name)
  let existing
  try {
    existing = fs.lstatSync(target)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (existing && (existing.isSymbolicLink() || !existing.isFile() || existing.nlink > 1)) {
    throw new Error('O arquivo de evidência não pode ser um link, junction ou diretório')
  }
  if (path.relative(selectedDirectory, resolvedTarget(target)) !== name) {
    throw new Error('O arquivo de evidência deve permanecer no diretório escolhido')
  }
  return target
}

function frontendBuildAssetsDirectory() {
  const directory = process.env.ADC_FRONTEND_BUILD_DIRECTORY
    ? outsideServedDist(process.env.ADC_FRONTEND_BUILD_DIRECTORY)
    : path.join(frontendRoot, 'dist')
  return path.join(directory, 'assets')
}

module.exports = {
  browserArtifactPath,
  frontendBuildAssetsDirectory,
  safeBrowserArtifactPath,
  safeBrowserArtifactDirectory: outsideServedDist,
}
