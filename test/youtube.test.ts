import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  extractYouTubeDescription,
  isYouTubeUrl,
  normalizeYouTubeWatchUrl,
  tryParseYouTubeRecipe,
} from '../src/lib/youtube'

describe('youtube urls', () => {
  it('detects watch, shorts, youtu.be', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=V4i77gmd-vI')).toBe(true)
    expect(isYouTubeUrl('https://www.youtube.com/shorts/V4i77gmd-vI')).toBe(true)
    expect(isYouTubeUrl('https://youtu.be/V4i77gmd-vI')).toBe(true)
    expect(isYouTubeUrl('https://www.bbcgoodfood.com/recipes/x')).toBe(false)
  })

  it('normalizes to watch?v=', () => {
    expect(normalizeYouTubeWatchUrl('https://youtu.be/V4i77gmd-vI')).toBe(
      'https://www.youtube.com/watch?v=V4i77gmd-vI',
    )
    expect(normalizeYouTubeWatchUrl('https://www.youtube.com/shorts/V4i77gmd-vI')).toBe(
      'https://www.youtube.com/watch?v=V4i77gmd-vI',
    )
  })
})

describe('extractYouTubeDescription', () => {
  it('reads title and shortDescription from fixture', () => {
    const html = readFileSync('fixtures/youtube-salmon-meal-prep.html', 'utf8')
    const got = extractYouTubeDescription(html)
    expect(got?.title).toMatch(/Salmon Meal Prep/i)
    expect(got?.description).toMatch(/Ingredients:/i)
    expect(got?.description).toMatch(/Directions:/i)
  })

  it('returns null when player JSON is missing', () => {
    expect(extractYouTubeDescription('<html><body>nope</body></html>')).toBeNull()
  })
})

describe('tryParseYouTubeRecipe', () => {
  it('builds a recipe from the salmon description fixture', () => {
    const html = readFileSync('fixtures/youtube-salmon-meal-prep.html', 'utf8')
    const recipe = tryParseYouTubeRecipe(html, 'https://www.youtube.com/watch?v=V4i77gmd-vI')
    expect(recipe).not.toBeNull()
    expect(recipe!.title).toMatch(/Salmon/i)
    expect(recipe!.ingredients.length).toBeGreaterThanOrEqual(8)
    expect(recipe!.steps.length).toBeGreaterThanOrEqual(4)
    expect(recipe!.servings).toBe(6)
    expect(recipe!.sourceUrl).toBe('https://www.youtube.com/watch?v=V4i77gmd-vI')
  })

  it('rejects a YouTube page whose description is not a recipe', () => {
    const html = `<html><script>var ytInitialPlayerResponse = ${JSON.stringify({
      videoDetails: {
        title: 'Vlog',
        shortDescription: 'Cookbook in bio\n\n#cooking',
      },
    })};</script></html>`
    expect(tryParseYouTubeRecipe(html, 'https://www.youtube.com/watch?v=aaaaaaaaaaa')).toBeNull()
  })
})
