import child_process from 'child_process'
import electron from 'electron'
import esbuild from 'esbuild'
import { once } from 'node:events'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const isDev = !process.argv.includes('--prod')
const withRenderer = isDev && process.argv.includes('--with-renderer')
const mainDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

if (process.platform === 'win32') {
  const distDir = path.join(mainDir, 'dist')

  fs.mkdirSync(distDir, { recursive: true })
  const csc = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
  for (const [source, binary, kind] of [
    ['shortcuts/clicker.cs', 'clicker.exe', 'exe'],
    ['PortableUpdater.cs', 'portable-updater.exe', 'winexe']
  ]) {
    child_process.execFileSync(csc, [
      '/nologo', '/target:' + kind, '/out:' + path.join(distDir, binary), path.join(mainDir, 'src', source)
    ], { stdio: 'inherit' })
  }
}

const electronRunner = (() => {
  let handle = null
  return {
    async restart () {
      console.info('Restarting Electron process.')

      if (handle && handle.exitCode == null && handle.signalCode == null) {
        const exited = once(handle, 'exit')
        handle.kill()
        await exited
      }
      const args = ['.', ...process.argv.slice(2).filter(arg => arg !== '--with-renderer')]
      if (withRenderer) {
        args.push('--user-data-dir=' + path.join(mainDir, 'dist', 'dev-profile'))
      }
      handle = child_process.spawn(electron, args, {
        stdio: 'inherit'
      })
    }
  }
})()

const visionBuild = await esbuild.build({
  entryPoints: ['src/vision/link-worker.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/vision.js'
})

const mainContext = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  minify: !isDev,
  platform: 'node',
  external: ['electron', 'uiohook-napi', 'electron-overlay-window'],
  outfile: 'dist/main.js',
  define: {
    'process.env.STATIC': (isDev) ? '"../build/icons"' : '"."',
    'process.env.VITE_DEV_SERVER_URL': (isDev) ? '"http://localhost:5176"' : 'null',
    'process.env.EXILE_TRADE_COMBINED_DEV': JSON.stringify(withRenderer)
  },
  plugins: (isDev) ? [{
    name: 'electron-runner',
    setup (build) {
      build.onEnd((result) => {
        if (!result.errors.length) return electronRunner.restart()
      })
    }
  }] : []
})

if (isDev) {
  await mainContext.watch()
} else {
  await mainContext.rebuild()
  mainContext.dispose()
}
