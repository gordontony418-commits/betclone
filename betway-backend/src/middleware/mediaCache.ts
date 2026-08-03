/**
 * mediaCache.ts
 *
 * Intercept-and-cache middleware for images, SVGs, and other media assets.
 *
 * Flow:
 *   1. Request comes in for /media-proxy/<encoded-original-url>
 *   2. Check MediaAsset DB — if cached, serve from disk
 *   3. If not cached, download from original URL, save to disk, record in DB, serve
 *
 * Also provides a generic "smart proxy" that catches any image URL pattern,
 * downloads it once, and serves it locally forever after.
 */

import { Request, Response, NextFunction, Router } from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// No DB import — media cache is filesystem-only

// Where downloaded assets are stored on disk
const UPLOADS_DIR = path.resolve(__dirname, '../../public/uploads')

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

// MIME type → file extension map
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'application/octet-stream': '.bin',
  'font/woff': '.woff',
  'font/woff2': '.woff2',
  'font/ttf': '.ttf',
}

function urlToFilename(url: string, mimeType?: string): string {
  // Use last path segment if it has an extension, otherwise hash the URL
  const urlObj = new URL(url)
  const lastSegment = urlObj.pathname.split('/').pop() ?? ''
  if (lastSegment.includes('.') && lastSegment.length < 80) {
    return lastSegment.replace(/[^a-zA-Z0-9._-]/g, '_')
  }
  const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 12)
  const ext = mimeType ? (MIME_TO_EXT[mimeType] ?? '.bin') : '.bin'
  return `asset_${hash}${ext}`
}

function categoryFromMime(mime: string): string {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('font/')) return 'font'
  if (mime.includes('svg')) return 'svg'
  return 'other'
}

async function downloadAndCache(originalUrl: string): Promise<{ localPath: string; mimeType: string } | null> {
  try {
    const res = await fetch(originalUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BetwayLocalProxy/1.0)' },
    })

    if (!res.ok) {
      console.warn(`[mediaCache] Failed to download ${originalUrl}: HTTP ${res.status}`)
      return null
    }

    const mimeType = res.headers.get('content-type')?.split(';')[0].trim() ?? 'application/octet-stream'
    const filename = urlToFilename(originalUrl, mimeType)
    const localPath = path.join(UPLOADS_DIR, filename)

    const buffer = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(localPath, buffer)

    // Record in DB — skip, filesystem-only mode
    console.log(`[mediaCache] ✅ Cached ${filename} (${buffer.length} bytes) from ${originalUrl}`)
    return { localPath, mimeType }
  } catch (err) {
    console.warn(`[mediaCache] Error downloading ${originalUrl}:`, (err as Error).message)
    return null
  }
}

/**
 * Creates a cache-through proxy for a specific upstream base URL.
 * Usage: app.use('/proxy/media', createMediaProxy('https://media.betwayafrica.com'))
 */
export function createMediaProxy(upstreamBase: string): Router {
  const router = Router()

  router.get('*', async (req: Request, res: Response, _next: NextFunction) => {
    const subPath = req.path
    const originalUrl = `${upstreamBase}${subPath}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`

    // 1. Check filesystem cache first (skip DB — table may not exist)
    try {
      const filename = urlToFilename(originalUrl)
      const localPath = path.join(UPLOADS_DIR, filename)
      if (fs.existsSync(localPath)) {
        const ext = path.extname(filename).toLowerCase()
        const mimeMap: Record<string, string> = {
          '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
          '.woff': 'font/woff', '.woff2': 'font/woff2',
        }
        res.setHeader('Content-Type', mimeMap[ext] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.sendFile(localPath)
        return
      }
    } catch { /* fall through */ }

    // 2. Download from upstream
    const result = await downloadAndCache(originalUrl)
    if (result) {
      res.setHeader('Content-Type', result.mimeType)
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.sendFile(result.localPath)
    } else {
      res.status(404).json({ error: 'Media asset not found' })
    }
  })

  return router
}

/**
 * GET /uploads/:filename — serve locally cached files
 */
export function serveUploads(req: Request, res: Response): void {
  const filename = req.params.filename
  const filePath = path.join(UPLOADS_DIR, filename.replace(/\.\./g, '')) // path traversal guard
  if (fs.existsSync(filePath)) {
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.sendFile(filePath)
  } else {
    res.status(404).json({ error: 'File not found' })
  }
}
