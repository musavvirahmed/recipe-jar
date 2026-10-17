import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseImportedHtml } from '../src/lib/importRecipe'
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
    expect(normalizeYouTubeWatchUrl('https://m.youtube.com/watch?v=V4i77gmd-vI')).toBe(
      'https://www.youtube.com/watch?v=V4i77gmd-vI',
    )
  })

  it('does not normalize non-YouTube hosts that embed a watch link', () => {
    expect(
      normalizeYouTubeWatchUrl(
        'https://example.com/blog?ref=youtube.com/watch?v=abcdefghijk',
      ),
    ).toBeNull()
    expect(normalizeYouTubeWatchUrl('https://notyoutube.com/shorts/abcdefghijk')).toBeNull()
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

describe('parseImportedHtml', () => {
  it('prefers JSON-LD over YouTube description on a structured page', () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Recipe',
        name: 'Tomato Soup',
        recipeIngredient: ['2 tomatoes', 'salt'],
        recipeInstructions: ['Simmer.'],
      })}</script>
      <script>var ytInitialPlayerResponse = ${JSON.stringify({
        videoDetails: { title: 'Wrong', shortDescription: 'not a recipe' },
      })};</script>
      </head><body></body></html>`
    const r = parseImportedHtml(html, 'https://www.youtube.com/watch?v=abc12345678')
    expect(r?.title).toBe('Tomato Soup')
  })

  it('falls back to YouTube description when structured data is missing', () => {
    const html = readFileSync('fixtures/youtube-salmon-meal-prep.html', 'utf8')
    const recipe = parseImportedHtml(html, 'https://www.youtube.com/watch?v=V4i77gmd-vI')
    expect(recipe).not.toBeNull()
    expect(recipe!.title).toMatch(/Salmon/i)
  })

  it('returns null for non-recipe pages', () => {
    expect(parseImportedHtml('<html><body>hello</body></html>', 'https://example.com/x')).toBeNull()
  })
})

describe('tryParseYouTubeRecipe', () => {
  it('builds a recipe from the salmon description fixture', () => {
    const html = readFileSync('fixtures/youtube-salmon-meal-prep.html', 'utf8')
    const recipe = tryParseYouTubeRecipe(html, 'https://www.youtube.com/watch?v=V4i77gmd-vI')
    expect(recipe).not.toBeNull()
    expect(recipe!.title).toMatch(/Salmon/i)
    expect(recipe!.ingredients.length).toBeGreaterThanOrEqual(8)
    expect(recipe!.steps.length).toBe(6)
    expect(recipe!.servings).toBe(6)
    expect(recipe!.sourceUrl).toBe('https://www.youtube.com/watch?v=V4i77gmd-vI')
    // Yield / CTA / hashtag footer must not pollute the card
    expect(recipe!.ingredients.map((i) => i.raw)).not.toContain('this makes 6 meals')
    expect(recipe!.ingredients[0]?.raw).toMatch(/sockeye salmon/i)
    expect(recipe!.steps.some((s) => /follow for more/i.test(s))).toBe(false)
    expect(recipe!.steps.some((s) => /#cooking/i.test(s))).toBe(false)
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

  it('rejects vlog-style descriptions without recipe headers', () => {
    const html = `<html><script>var ytInitialPlayerResponse = ${JSON.stringify({
      videoDetails: {
        title: 'Weekly vlog',
        shortDescription:
          'New vlog out now\nCamera: Sony A7\nMusic: Epidemic Sound\nThanks so much for watching and see you next week.',
      },
    })};</script></html>`
    expect(tryParseYouTubeRecipe(html, 'https://www.youtube.com/watch?v=aaaaaaaaaaa')).toBeNull()
  })

  it('rejects gear-list descriptions without recipe headers', () => {
    const html = `<html><script>var ytInitialPlayerResponse = ${JSON.stringify({
      videoDetails: {
        title: 'My setup',
        shortDescription:
          'Gear I use:\nCamera: Sony A7IV\nLens: 24-70mm\nMic: Rode Wireless\nSubscribe for more!',
      },
    })};</script></html>`
    expect(tryParseYouTubeRecipe(html, 'https://www.youtube.com/watch?v=aaaaaaaaaaa')).toBeNull()
  })
})
