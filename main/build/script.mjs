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
  const csFile = path.join(mainDir, 'src/shortcuts/clicker.cs')
  const exeFile = path.join(distDir, 'clicker.exe')

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true })
  }
  try {
    console.info('Compiling clicker.cs...')
    child_process.execFileSync(
      'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
      ['/nologo', '/out:' + exeFile, csFile],
      { stdio: 'inherit' }
    )
    console.info('clicker.cs compiled successfully.')
  } catch (err) {
    console.error('Failed to compile clicker.cs:', err.toString())
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
