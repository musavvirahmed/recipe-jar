import { parseIngredientLine } from './quantity'
import { parseRecipeText } from './textparse'
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
  const markerMatch = html.match(/(?:var\s+)?ytInitialPlayerResponse\s*=/)
  if (!markerMatch || markerMatch.index === undefined) return null

  const braceStart = html.indexOf('{', markerMatch.index + markerMatch[0].length)
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

/** Creators often write "Ingredients: makes 6 meals" on one line; textparse needs a header line. */
function normalizeDescriptionForParsing(description: string): string {
  return description.replace(
    /^(\s*(?:ingredients|ingredienser|zutaten|ingr[eé]dients|you will need|shopping list))\s*:\s*(.+)$/gim,
    (_, header, rest) => `${header.trim()}\n${rest.trim()}`,
  )
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

export function tryParseYouTubeRecipe(html: string, sourceUrl: string): Recipe | null {
  const meta = extractYouTubeDescription(html)
  if (!meta) return null

  const parsed = parseRecipeText(normalizeDescriptionForParsing(meta.description))
  const ingredientLines = parsed.ingredients.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const stepLines = parsed.steps.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  if (ingredientLines.length < 2 || stepLines.length < 1) return null

  const servingsParsed = parseInt(parsed.servings, 10)
  const servings = Number.isFinite(servingsParsed) && servingsParsed > 0 ? servingsParsed : null

  const title = meta.title.trim() || parsed.title.trim() || 'Untitled recipe'

  return {
    title,
    description: '',
    image: null,
    author: null,
    sourceUrl,
    servings,
    yieldText: null,
    totalTime: null,
    prepTime: null,
    cookTime: null,
    ingredients: ingredientLines.map((raw) => ({ raw, ...parseIngredientLine(raw) })),
    steps: stepLines,
  }
}
