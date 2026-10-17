import type { Recipe } from './types'

const YOUTUBE_VIDEO_ID = /(?:youtube\.com\/(?:watch\?(?:[^&]*&)*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/

const YOUTUBE_HOST =
  /^(?:www\.|m\.)?youtube\.com$|^youtu\.be$/i

export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return YOUTUBE_HOST.test(parsed.hostname)
  } catch {
    return false
  }
}

export function normalizeYouTubeWatchUrl(url: string): string | null {
  const match = url.match(YOUTUBE_VIDEO_ID)
  if (!match) return null
  return `https://www.youtube.com/watch?v=${match[1]}`
}

function extractYtInitialPlayerResponseJson(html: string): string | null {
  const marker = 'var ytInitialPlayerResponse'
  const startIdx = html.indexOf(marker)
  if (startIdx === -1) return null

  const braceStart = html.indexOf('{', startIdx)
  if (braceStart === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return html.slice(braceStart, i + 1)
    }
  }
  return null
}

export function extractYouTubeDescription(
  html: string,
): { title: string; description: string } | null {
  const jsonText = extractYtInitialPlayerResponseJson(html)
  if (!jsonText) return null

  let data: unknown
  try {
    data = JSON.parse(jsonText)
  } catch {
    return null
  }

  const videoDetails = (data as { videoDetails?: { title?: string; shortDescription?: string } })
    .videoDetails
  if (!videoDetails) return null

  const title = videoDetails.title?.trim()
  const description = videoDetails.shortDescription?.trim()
  if (!title || !description) return null

  return { title, description }
}

export function tryParseYouTubeRecipe(_html: string, _sourceUrl: string): Recipe | null {
  return null
}
