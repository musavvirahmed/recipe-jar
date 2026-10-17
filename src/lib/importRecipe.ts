import { parseRecipeFromHtml } from './parse'
import { isYouTubeUrl, tryParseYouTubeRecipe } from './youtube'
import type { Recipe } from './types'

export function parseImportedHtml(html: string, sourceUrl: string): Recipe | null {
  const parsed = parseRecipeFromHtml(html, sourceUrl)
  if (parsed) return parsed
  if (isYouTubeUrl(sourceUrl)) return tryParseYouTubeRecipe(html, sourceUrl)
  return null
}
