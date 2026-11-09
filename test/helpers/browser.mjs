import fs from 'node:fs'

/*
 * playwright-core ships no browser. The browser tests need a Chromium build that
 * is already installed on the machine: SOURCE_I18N_BROWSER wins, otherwise the
 * usual install locations per platform are tried (CI runners have Chrome at
 * /usr/bin/google-chrome, Windows usually has Edge).
 */
const CANDIDATES = {
  win32: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
}

/** Path of a usable Chromium build, or undefined when there is none. */
export function findBrowser() {
  const fromEnv = process.env.SOURCE_I18N_BROWSER
  const candidates = fromEnv ? [fromEnv] : (CANDIDATES[process.platform] ?? [])
  return candidates.find((candidate) => fs.existsSync(candidate))
}
