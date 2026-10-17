import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  extractYouTubeDescription,
  isYouTubeUrl,
  normalizeYouTubeWatchUrl,
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
