import { parseIngredientLine } from './quantity'
import { INGREDIENTS_HEADER, parseRecipeText, STEPS_HEADER } from './textparse'
import type { Recipe } from './types'

const YOUTUBE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/

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

function extractYouTubeVideoId(url: string): string | null {
  if (!isYouTubeUrl(url)) return null

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.hostname === 'youtu.be') {
    const id = parsed.pathname.replace(/^\//, '').split('/')[0] ?? ''
    return YOUTUBE_VIDEO_ID.test(id) ? id : null
  }

  const pathMatch = parsed.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/)
  if (pathMatch) {
    const id = pathMatch[2]
    return YOUTUBE_VIDEO_ID.test(id) ? id : null
  }

  if (parsed.pathname === '/watch') {
    const v = parsed.searchParams.get('v')
    if (v && YOUTUBE_VIDEO_ID.test(v)) return v
  }

  return null
}

export function normalizeYouTubeWatchUrl(url: string): string | null {
  const id = extractYouTubeVideoId(url)
  if (!id) return null
  return `https://www.youtube.com/watch?v=${id}`
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

/** Creators often write "Ingredients: …" / "Directions: …" on one line; textparse needs header lines. */
function normalizeDescriptionForParsing(description: string): string {
  let text = description.replace(
    /^(\s*(?:ingredients|ingredienser|zutaten|ingr[eé]dients|you will need|shopping list))\s*:\s*(.+)$/gim,
    (_, header, rest) => `${header.trim()}\n${rest.trim()}`,
  )
  text = text.replace(
    /^(\s*(?:method|methods|instructions?|directions?|steps|preparation|g[öo]r s[åa] h[äa]r|instruktioner|tillagning|s[åa] h[äa]r g[öo]r du))\s*:\s*(.+)$/gim,
    (_, header, rest) => `${header.trim()}\n${rest.trim()}`,
  )
  return text
}

function descriptionHasRecipeStructure(normalizedDescription: string): boolean {
  const lines = normalizedDescription
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  let hasIngredientsHeader = false
  let hasStepsHeader = false
  for (const line of lines) {
    if (INGREDIENTS_HEADER.test(line)) hasIngredientsHeader = true
    if (STEPS_HEADER.test(line)) hasStepsHeader = true
  }
  return hasIngredientsHeader && hasStepsHeader
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

  const normalizedDescription = normalizeDescriptionForParsing(meta.description)
  if (!descriptionHasRecipeStructure(normalizedDescription)) return null

  const parsed = parseRecipeText(normalizedDescription)
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
