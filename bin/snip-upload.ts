#!/usr/bin/env node
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'

const CONFIG_PATH = join(homedir(), '.local', 'colin', 'snips.json')

const EXT_TO_MIME = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
}

const IMAGE_EXTS = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.avif'])

// Force-type flags: override the content-type and the saved file extension.
// `kind` controls how content is read from the clipboard: 'text' uses the
// plain-text target, 'html' uses the html target, 'image' uses the image target.
const FORCE_FLAGS = {
  '--md': { ext: '.md', mime: 'text/markdown; charset=utf-8', kind: 'text' },
  '--txt': { ext: '.txt', mime: 'text/plain; charset=utf-8', kind: 'text' },
  '--html': { ext: '.html', mime: 'text/html; charset=utf-8', kind: 'html' },
  '--json': { ext: '.json', mime: 'application/json', kind: 'text' },
  '--csv': { ext: '.csv', mime: 'text/csv; charset=utf-8', kind: 'text' },
  '--tsv': { ext: '.tsv', mime: 'text/tab-separated-values; charset=utf-8', kind: 'text' },
  '--xml': { ext: '.xml', mime: 'application/xml', kind: 'text' },
  '--yaml': { ext: '.yaml', mime: 'application/yaml', kind: 'text' },
  '--yml': { ext: '.yml', mime: 'application/yaml', kind: 'text' },
  '--png': { ext: '.png', mime: 'image/png', kind: 'image' },
}

function fail(msg: string, code = 1): never {
  console.error(msg)
  process.exit(code)
}

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
function randomBase62(len = 8) {
  // Rejection sampling to avoid modulo bias (256 isn't a multiple of 62).
  const max = Math.floor(256 / 62) * 62 // 248
  let out = ''
  while (out.length < len) {
    for (const b of randomBytes(len * 2)) {
      if (b < max) {
        out += BASE62[b % 62]
        if (out.length === len) break
      }
    }
  }
  return out
}

function withRandomSuffix(filename: string, len = 8) {
  const ext = extname(filename)
  const stem = ext ? filename.slice(0, -ext.length) : filename
  return `${stem}-${randomBase62(len)}${ext}`
}

async function loadConfig() {
  try {
    const cfg = JSON.parse(await readFile(CONFIG_PATH, 'utf8'))
    for (const key of ['bucket', 'region', 'accessKeyId', 'secretAccessKey', 'prefix', 'publicBaseUrl']) {
      if (!cfg[key]) fail(`Missing "${key}" in ${CONFIG_PATH}`)
    }
    return cfg
  }
  catch (e: any) {
    if (e?.code === 'ENOENT') {
      fail(`Config not found: ${CONFIG_PATH}\n\nCreate it with:\n${JSON.stringify({ bucket: 'my-bucket', region: 'us-east-1', endpoint: 'https://s3.us-east-1.amazonaws.com', accessKeyId: 'AKIA...', secretAccessKey: '...', prefix: 'snips/', publicBaseUrl: 'https://cdn.example.com' }, null, 2)}`)
    }
    throw e
  }
}

// --- AWS SigV4 signing for S3 PUT ---

function hmacSha256(key, data) {
  return createHmac('sha256', key).update(data).digest()
}

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex')
}

function s3Host(cfg) {
  if (cfg.endpoint) {
    const u = new URL(cfg.endpoint)
    return u.host
  }
  return `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`
}

function s3Url(cfg, s3Key) {
  if (cfg.endpoint) {
    const base = cfg.endpoint.replace(/\/+$/, '')
    return `${base}/${cfg.bucket}/${s3Key}`
  }
  return `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${s3Key}`
}

function sigV4Headers(cfg, method, s3Key, body, contentType) {
  const now = new Date()
  const dateStamp = now.toISOString().replace(/[-:]/g, '').slice(0, 8)
  const amzDate = dateStamp + 'T' + now.toISOString().replace(/[-:]/g, '').slice(9, 15) + 'Z'
  const host = s3Host(cfg)
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`
  const payloadHash = sha256Hex(body)

  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n'
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'

  const canonicalUri = cfg.endpoint ? `/${cfg.bucket}/${s3Key}` : '/' + s3Key
  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  let signingKey = hmacSha256(`AWS4${cfg.secretAccessKey}`, dateStamp)
  signingKey = hmacSha256(signingKey, cfg.region)
  signingKey = hmacSha256(signingKey, 's3')
  signingKey = hmacSha256(signingKey, 'aws4_request')
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')

  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    'Content-Type': contentType,
    'Host': host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    'Authorization': authorization,
  }
}

// --- Utilities ---

function ensureCwebp() {
  const r = spawnSync('cwebp', ['-version'], { stdio: 'ignore' })
  if (r.error || r.status !== 0) {
    fail('cwebp not found.\n  macOS:  brew install webp\n  Debian: sudo apt-get install webp')
  }
}

function ensureXclip() {
  const r = spawnSync('xclip', ['-version'], { stdio: 'ignore' })
  if (r.error || r.status !== 0) {
    fail('xclip not found.\n  Debian/Ubuntu: sudo apt-get install xclip\n  Fedora:        sudo dnf install xclip\n  Arch:          sudo pacman -S xclip')
  }
}

function isWSL() {
  return !!process.env.WSL_DISTRO_NAME
}

function runPowerShell(command, opts = {}) {
  const args = ['-NoProfile', '-Command', command]
  let r = spawnSync('powershell.exe', args, opts)
  if ((r.error as any)?.code === 'ENOENT') {
    r = spawnSync('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', args, opts)
  }
  return r
}

function copyToClipboard(text) {
  if (isWSL()) {
    const ps = `Set-Clipboard -Value '${text.replace(/'/g, "''")}'`
    const r = runPowerShell(ps, { stdio: ['ignore', 'ignore', 'inherit'] })
    if (r.error || r.status !== 0) {
      process.stderr.write('(could not copy URL to Windows clipboard)\n')
      return false
    }
    return true
  }
  const r = spawnSync('xclip', ['-selection', 'clipboard'], { input: text })
  if ((r.error as any)?.code === 'ENOENT') {
    process.stderr.write('(xclip not installed; URL not copied)\n')
    return false
  }
  if (r.error || r.status !== 0) {
    process.stderr.write('(could not copy URL to clipboard)\n')
    return false
  }
  return true
}

function convertToWebp(inputPath, quality) {
  ensureCwebp()
  const stem = basename(inputPath, extname(inputPath))
  const out = join(tmpdir(), `snip-upload-${process.pid}-${Date.now()}-${stem}.webp`)
  const r = spawnSync('cwebp', ['-q', String(quality), '-mt', inputPath, '-o', out], {
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  if (r.status !== 0) fail('cwebp failed')
  return out
}

// --- Force-flag and content-type detection ---

function extractForceFlag(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (FORCE_FLAGS[a]) {
      return { force: FORCE_FLAGS[a], rest: [...args.slice(0, i), ...args.slice(i + 1)] }
    }
  }
  return { force: null, rest: args }
}

function pickXclipTextTarget(targets) {
  if (targets.includes('UTF8_STRING')) return 'UTF8_STRING'
  if (targets.includes('text/plain;charset=utf-8')) return 'text/plain;charset=utf-8'
  if (targets.includes('text/plain')) return 'text/plain'
  return null
}

// Markers in clipboard targets that suggest the text/plain payload is markdown.
// "text/markhtml" is included because some apps advertise it alongside text/plain
// to indicate the plain text is markdown source.
const MARKDOWN_TARGETS = ['text/markdown', 'text/x-markdown', 'text/markhtml']

function decideXclipContent(targets, force) {
  if (force) {
    if (force.kind === 'image') {
      if (!targets.includes('image/png')) fail('Clipboard does not contain an image (image/png)')
      return { target: 'image/png', ext: force.ext, mime: force.mime, isImage: true }
    }
    if (force.kind === 'html') {
      if (!targets.includes('text/html')) fail('Clipboard does not contain text/html')
      return { target: 'text/html', ext: force.ext, mime: force.mime, isImage: false }
    }
    const target = pickXclipTextTarget(targets)
    if (!target) fail('Clipboard does not contain text')
    return { target, ext: force.ext, mime: force.mime, isImage: false }
  }

  if (targets.includes('image/png')) {
    return { target: 'image/png', ext: '.png', mime: 'image/png', isImage: true }
  }

  const hasMarkdownMarker = targets.some(t => MARKDOWN_TARGETS.includes(t))
  const hasHtml = targets.includes('text/html')
  const textTarget = pickXclipTextTarget(targets)

  if (textTarget && (hasMarkdownMarker || hasHtml)) {
    return { target: textTarget, ext: '.md', mime: 'text/markdown; charset=utf-8', isImage: false }
  }
  if (hasHtml) {
    return { target: 'text/html', ext: '.html', mime: 'text/html; charset=utf-8', isImage: false }
  }
  if (textTarget) {
    return { target: textTarget, ext: '.txt', mime: 'text/plain; charset=utf-8', isImage: false }
  }
  fail(`Clipboard does not contain a supported format. Available targets:\n  ${targets.join('\n  ') || '(none)'}`)
}

// --- Clipboard commands ---

async function cmdWslClip(args) {
  await loadConfig()
  const { force, rest } = extractForceFlag(args)

  // Probe what's in the clipboard.
  const probePs = [
    `Add-Type -AssemblyName System.Windows.Forms;`,
    `$image = [System.Windows.Forms.Clipboard]::ContainsImage();`,
    `$text = [System.Windows.Forms.Clipboard]::ContainsText();`,
    `$html = [System.Windows.Forms.Clipboard]::ContainsText([System.Windows.Forms.TextDataFormat]::Html);`,
    `Write-Output "image=$image"; Write-Output "text=$text"; Write-Output "html=$html"`,
  ].join(' ')
  const probe = runPowerShell(probePs, { encoding: 'utf8' })
  if (probe.error) fail(`powershell.exe not found: ${probe.error.message}`)
  if (probe.status !== 0) fail('Failed to probe Windows clipboard')
  const probeOut = String(probe.stdout ?? '')
  const flags: Record<string, boolean> = Object.fromEntries(probeOut.split('\n').map(l => l.trim()).filter(Boolean).map((l) => {
    const [k, v] = l.split('=')
    return [k, v === 'True']
  }))

  // Decide what to grab.
  let mode, ext, mime
  if (force) {
    mode = force.kind
    if (mode === 'image' && !flags.image) fail('Clipboard does not contain an image')
    if (mode === 'html' && !flags.html) fail('Clipboard does not contain HTML')
    if (mode === 'text' && !flags.text) fail('Clipboard does not contain text')
    ext = force.ext
    mime = force.mime
  }
  else if (flags.image) {
    mode = 'image'
    ext = '.png'
    mime = 'image/png'
  }
  else if (flags.text && flags.html) {
    // Heuristic: text + html present means the plain text is likely markdown.
    mode = 'text'
    ext = '.md'
    mime = 'text/markdown; charset=utf-8'
  }
  else if (flags.html) {
    mode = 'html'
    ext = '.html'
    mime = 'text/html; charset=utf-8'
  }
  else if (flags.text) {
    mode = 'text'
    ext = '.txt'
    mime = 'text/plain; charset=utf-8'
  }
  else {
    fail('Windows clipboard does not contain image, text, or HTML')
  }

  const tmpFile = join(tmpdir(), `snip-upload-clipboard-${process.pid}-${Date.now()}${ext}`)
  const winPathRes = spawnSync('wslpath', ['-w', tmpFile], { encoding: 'utf8' })
  if (winPathRes.error || winPathRes.status !== 0) fail('wslpath failed (not running in WSL?)')
  const winPath = winPathRes.stdout.trim().replace(/'/g, "''")

  let savePs
  if (mode === 'image') {
    savePs = [
      `Add-Type -AssemblyName System.Windows.Forms;`,
      `$img = [System.Windows.Forms.Clipboard]::GetImage();`,
      `if ($img -eq $null) { [Console]::Error.WriteLine('Clipboard does not contain an image'); exit 2 }`,
      `$img.Save('${winPath}', [System.Drawing.Imaging.ImageFormat]::Png)`,
    ].join(' ')
  }
  else if (mode === 'html') {
    // CF_HTML includes a metadata header followed by the actual HTML. Extract
    // the fragment between StartFragment/EndFragment if present.
    savePs = [
      `Add-Type -AssemblyName System.Windows.Forms;`,
      `$cf = [System.Windows.Forms.Clipboard]::GetText([System.Windows.Forms.TextDataFormat]::Html);`,
      `if ([string]::IsNullOrEmpty($cf)) { [Console]::Error.WriteLine('Clipboard does not contain HTML'); exit 2 }`,
      `$startMarker = '<!--StartFragment-->'; $endMarker = '<!--EndFragment-->';`,
      `$s = $cf.IndexOf($startMarker); $e = $cf.IndexOf($endMarker);`,
      `if ($s -ge 0 -and $e -gt $s) { $html = $cf.Substring($s + $startMarker.Length, $e - $s - $startMarker.Length) }`,
      `else { $idx = $cf.IndexOf('<'); if ($idx -ge 0) { $html = $cf.Substring($idx) } else { $html = $cf } }`,
      `[System.IO.File]::WriteAllText('${winPath}', $html, [System.Text.UTF8Encoding]::new($false))`,
    ].join(' ')
  }
  else {
    savePs = [
      `Add-Type -AssemblyName System.Windows.Forms;`,
      `$text = [System.Windows.Forms.Clipboard]::GetText();`,
      `if ([string]::IsNullOrEmpty($text)) { [Console]::Error.WriteLine('Clipboard does not contain text'); exit 2 }`,
      `[System.IO.File]::WriteAllText('${winPath}', $text, [System.Text.UTF8Encoding]::new($false))`,
    ].join(' ')
  }

  const r = runPowerShell(savePs, { stdio: ['ignore', 'inherit', 'inherit'] })
  if (r.error) fail(`powershell.exe not found: ${r.error.message}`)
  if (r.status !== 0) fail(`Failed to read ${mode} from Windows clipboard`)

  await stat(tmpFile).catch(() => fail('Clipboard did not produce a file'))

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const noConvert = rest.includes('--no-convert') || mode !== 'image'
  const finalExt = (mode === 'image' && !noConvert) ? '.webp' : ext
  const defaultName = `clipboard-${ts}${finalExt}`
  const finalArgs = rest.includes('--name') ? [tmpFile, ...rest] : [tmpFile, '--name', defaultName, ...rest]

  try {
    await cmdUpload(finalArgs)
  }
  finally {
    await unlink(tmpFile).catch(() => {})
  }
}

async function cmdXclip(args) {
  await loadConfig()
  ensureXclip()
  const { force, rest } = extractForceFlag(args)

  const targetsRes = spawnSync('xclip', ['-selection', 'clipboard', '-t', 'TARGETS', '-o'], { encoding: 'utf8' })
  if (targetsRes.status !== 0) fail('Could not query clipboard targets (is a display available?)')
  const available = String(targetsRes.stdout ?? '').split('\n').map(s => s.trim()).filter(Boolean)

  const decision = decideXclipContent(available, force)

  const grab = spawnSync('xclip', ['-selection', 'clipboard', '-t', decision.target, '-o'])
  if (grab.status !== 0) fail(`Failed to read ${decision.target} from clipboard`)

  const tmpFile = join(tmpdir(), `snip-upload-clipboard-${process.pid}-${Date.now()}${decision.ext}`)
  await writeFile(tmpFile, grab.stdout)

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const noConvert = rest.includes('--no-convert') || !decision.isImage
  const finalExt = (decision.isImage && !noConvert) ? '.webp' : decision.ext
  const defaultName = `clipboard-${ts}${finalExt}`
  const finalArgs = rest.includes('--name') ? [tmpFile, ...rest] : [tmpFile, '--name', defaultName, ...rest]

  try {
    await cmdUpload(finalArgs)
  }
  finally {
    await unlink(tmpFile).catch(() => {})
  }
}

// --- Upload ---

type ForceFlag = (typeof FORCE_FLAGS)[keyof typeof FORCE_FLAGS]
type UploadOpts = {
  quality: number
  noConvert: boolean
  noCopy: boolean
  pressAnyKey: boolean
  noRandom: boolean
  name: string | null
  file: string
  force: ForceFlag | null
}

function parseUploadArgs(args): UploadOpts {
  const opts: any = { quality: 90, noConvert: false, noCopy: false, pressAnyKey: false, noRandom: false, name: null, file: null, force: null }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (FORCE_FLAGS[a]) { opts.force = FORCE_FLAGS[a]; continue }
    if (a === '--quality' || a === '-q') opts.quality = Number(args[++i])
    else if (a === '--no-convert') opts.noConvert = true
    else if (a === '--no-copy') opts.noCopy = true
    else if (a === '--no-random') opts.noRandom = true
    else if (a === '--press-any-key') opts.pressAnyKey = true
    else if (a === '--name') opts.name = args[++i]
    else if (a.startsWith('-')) fail(`Unknown option: ${a}`)
    else if (!opts.file) opts.file = a
    else fail(`Unexpected argument: ${a}`)
  }
  if (!opts.file) fail('Usage: snip-upload <file> [--quality N] [--no-convert] [--no-copy] [--no-random] [--press-any-key] [--name new-name.ext] [--md|--txt|--html|--json|--csv|--xml|--yaml|--png]')
  return opts as UploadOpts
}

async function cmdUpload(args) {
  const cfg = await loadConfig()
  const opts = parseUploadArgs(args)
  await stat(opts.file).catch(() => fail(`File not found: ${opts.file}`))

  const origExt = extname(opts.file).toLowerCase()
  // Force flag overrides the effective extension; otherwise the file's own extension wins.
  const effectiveExt = opts.force ? opts.force.ext : origExt
  const isImage = IMAGE_EXTS.has(effectiveExt)

  let uploadPath = opts.file
  let cleanup: string | null = null
  let contentType: string
  let outExt = effectiveExt

  if (opts.force) {
    contentType = opts.force.mime
    outExt = opts.force.ext
  }
  else if (effectiveExt === '.webp') {
    contentType = 'image/webp'
  }
  else if (!isImage) {
    contentType = EXT_TO_MIME[effectiveExt]
    if (!contentType) fail(`Unsupported file extension: ${effectiveExt}. Use a force flag (e.g. --txt) to override.`)
  }
  else if (opts.noConvert) {
    contentType = EXT_TO_MIME[effectiveExt]
    if (!contentType) fail(`Unsupported file extension for --no-convert: ${effectiveExt}`)
  }
  else {
    process.stderr.write(`Converting to WebP (quality=${opts.quality})... `)
    uploadPath = convertToWebp(opts.file, opts.quality)
    cleanup = uploadPath
    process.stderr.write(`done\n`)
    contentType = 'image/webp'
    outExt = '.webp'
  }

  // Pick filename: explicit --name > rewrite extension if force/conversion changed it > basename of upload file.
  let filename
  if (opts.name) {
    filename = opts.name
  }
  else if (outExt !== origExt) {
    filename = basename(opts.file, origExt) + outExt
  }
  else {
    filename = basename(uploadPath)
  }

  // Add a random suffix so URLs aren't enumerable from a known path.
  if (!opts.noRandom) filename = withRandomSuffix(filename)

  const s3Key = cfg.prefix + filename
  const fileBuf = await readFile(uploadPath)

  const url = s3Url(cfg, s3Key)
  const headers = sigV4Headers(cfg, 'PUT', s3Key, fileBuf, contentType)

  process.stderr.write(`Uploading ${fileBuf.length} bytes to s3://${cfg.bucket}/${s3Key}... `)
  const upRes = await fetch(url, {
    method: 'PUT',
    headers,
    body: fileBuf,
  })
  if (!upRes.ok) {
    process.stderr.write('failed\n')
    fail(`S3 upload failed: ${upRes.status} ${await upRes.text()}`)
  }
  process.stderr.write('done\n')

  if (cleanup) await unlink(cleanup).catch(() => {})

  const publicUrl = cfg.publicBaseUrl.replace(/\/+$/, '') + '/' + s3Key
  console.log(publicUrl)
  if (!opts.noCopy && !process.env.CLAUDECODE) copyToClipboard(publicUrl)
  if (opts.pressAnyKey) await pressAnyKey()
}

async function pressAnyKey() {
  process.stderr.write('Press any key to continue...')
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    await new Promise(resolve => process.stdin.once('data', resolve))
    process.stdin.setRawMode(false)
    process.stdin.pause()
  }
  else {
    const rl = createInterface({ input: process.stdin, output: process.stderr })
    await rl.question('')
    rl.close()
  }
  process.stderr.write('\n')
}

// --- CLI ---

function usage() {
  process.stdout.write(`snip-upload — upload files (or clipboard contents) to S3

Usage:
  snip-upload <file> [options]          Upload a file; prints the public URL
  snip-upload xclip [options]           Upload clipboard contents (X11 / xclip)
  snip-upload wslclip [options]         Upload clipboard contents (Windows, via WSL)
  snip-upload                           In WSL: same as 'wslclip'

Auto-detected clipboard content (in order):
  image  -> .webp (cwebp converted) or .png (--no-convert)
  text + html (or text/markdown marker)  -> .md
  html only  -> .html
  text only  -> .txt

Force-type flags (override auto-detection / file extension):
  --md     text/markdown          --json   application/json
  --txt    text/plain             --csv    text/csv
  --html   text/html              --tsv    text/tab-separated-values
  --xml    application/xml        --yaml / --yml  application/yaml
  --png    image/png (no webp conversion)

Other options:
  --quality, -q N    cwebp quality for images (default 90; 100 = lossless)
  --no-convert       Upload original file as-is (skip cwebp)
  --no-copy          Don't copy the resulting URL to the clipboard
  --no-random        Don't append the 8-char random suffix to the filename
  --press-any-key    Wait for a keypress before exiting
  --name NAME        Override the basename used in the S3 key
                     (random suffix is still added unless --no-random)

Config: ${CONFIG_PATH}
  Required keys: bucket, region, accessKeyId, secretAccessKey, prefix, publicBaseUrl
  Optional keys: endpoint (for S3-compatible services; uses path-style addressing)
`)
}

function hasPositional(argv) {
  const valueTaking = new Set(['--quality', '-q', '--name'])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (valueTaking.has(a)) { i++; continue }
    if (!a.startsWith('-')) return true
  }
  return false
}

const argv = process.argv.slice(2)
const cmd = argv[0]
if (argv.length === 0) {
  if (isWSL()) await cmdWslClip([])
  else {
    usage()
    process.exit(1)
  }
}
else if (cmd === '--help' || cmd === '-h') {
  usage()
}
else if (cmd === 'xclip') {
  await cmdXclip(argv.slice(1))
}
else if (cmd === 'wslclip') {
  await cmdWslClip(argv.slice(1))
}
else if (!hasPositional(argv) && isWSL()) {
  await cmdWslClip(argv)
}
else {
  await cmdUpload(argv)
}
