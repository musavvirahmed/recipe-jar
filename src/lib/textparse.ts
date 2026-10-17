// Best-effort structuring of pasted recipe text into form fields. Heuristic by
// nature, so the caller shows the result in an editable form for review. Returns
// plain strings ready to drop into the manual-entry fields.

export interface ParsedText {
  title: string
  servings: string
  ingredients: string // newline-joined
  steps: string // newline-joined
}

/**
 * Core header patterns — matched against {@link normalizeHeaderCandidate} output
 * so "🛒 INGREDIENTS LIST" and "Ingredients:" share one allowlist.
 */
export const INGREDIENTS_HEADER =
  /^(?:ingredients(?:\s+list)?|ingredienser|zutaten|ingr[eé]dients|you will need|shopping list|المكونات|المقادير)[:\s]*$/i
export const STEPS_HEADER =
  /^(?:method|methods|instructions?|directions?|cooking\s+steps|quick\s+steps|steps|preparation|recipe|rezept|how to (?:make|cook|prepare)(?:\s+it)?|g[öo]r s[åa] h[äa]r|instruktioner|tillagning|s[åa] h[äa]r g[öo]r du|طريقة التحضير(?:\s+.*)?|طريقة الإعداد(?:\s+.*)?|الطريقة)[:\s]*$/i

/** Latin-script recipe headers — preferred when a bilingual paste has multiple blocks. */
const LATIN_RECIPE_HEADER =
  /^(?:ingredients(?:\s+list)?|ingredienser|zutaten|ingr[eé]dients|you will need|shopping list|method|methods|instructions?|directions?|cooking\s+steps|quick\s+steps|steps|preparation|recipe|rezept|how to (?:make|cook|prepare)(?:\s+it)?|g[öo]r s[åa] h[äa]r|instruktioner|tillagning|s[åa] h[äa]r g[öo]r du)[:\s]*$/i

const SECTION_DIVIDER = /^[-–—=*_]{2,}$/

/** Strip leading emoji / Markdown / bullets so decorated headers match the allowlist. */
export function normalizeHeaderCandidate(line: string): string {
  return line
    .trim()
    .replace(/^(?:[\p{Extended_Pictographic}\uFE0F\u200D]+\s*)+/u, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^(?:[*•·▢□☐●▪]+\s*)+/, '')
    .replace(/\*\*/g, '')
    .trim()
}

export function isIngredientsHeader(line: string): boolean {
  return INGREDIENTS_HEADER.test(normalizeHeaderCandidate(line))
}

export function isStepsHeader(line: string): boolean {
  return STEPS_HEADER.test(normalizeHeaderCandidate(line))
}

function isLatinRecipeHeader(line: string): boolean {
  return LATIN_RECIPE_HEADER.test(normalizeHeaderCandidate(line))
}

function isRecipeHeader(line: string): boolean {
  return isIngredientsHeader(line) || isStepsHeader(line)
}

// Lines that are website or app chrome, not recipe content. Dropped before
// parsing so an OCR'd or pasted page does not turn nav, ratings and badges into
// ingredients. Kept narrow on purpose so real recipe lines are never removed.
const CHROME_LINE = [
  /rating/i, // "3.3 | 3 ratings"
  /^\s*rate this\b/i, // "Rate this recipe"
  /^\s*\+?\s*(?:save|add) to\b/i, // "+ Save to My Food"
  /share\s*&\s*print/i, // "Share & Print"
  /^\s*shopping list\b/i,
  /^\s*(?:(?:dairy|gluten|egg|nut|soy|wheat|lactose|sugar)[ -]free\b[\s|]*)+$/i, // an allergen-badge-only line
  /^\s*ingredients\s+method\s*$/i, // merged two-column headers
  /^\s*by\b.{0,60}\bserves?\b/i, // "By Neneh Cherry and Andi Oliver Serve"
  /^\s*from\b.{0,60}\bserves?\s*\d/i, // "From ... Dish It Up Serves 4-6"
  /^\s*over\s+\d+\s*(?:hours?|mins?|minutes?)\s*$/i, // "Over 2 hours" badge
  /^\s*(?:prepare|overnight|save|cook)\s*$/i, // bare UI badges
  /^\s*[=<>«»]/, // OCR garbage rows ("= Lo . Dietar")
]

function isChrome(line: string): boolean {
  return CHROME_LINE.some((re) => re.test(line))
}

// Leading list bullets, checkbox glyphs, and Western / Arabic-Indic numerals.
const BULLET = /^\s*(?:[-*•·▢□☐●▪]|[\d\u0660-\u0669\u06F0-\u06F9]+[.)])\s+/

// A measurement-ish token at the start suggests an ingredient line.
const MEASURE = /^\s*(?:\d|½|¼|¾|⅓|⅔|⅛|a\s|an\s|one\s|two\s|three\s|pinch|dash|handful|clove|tsp|tbsp|cup|g\b|kg|ml|dl|l\b|oz|lb)/i

function stripBullet(s: string): string {
  return s
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(BULLET, '')
    .replace(/\*\*/g, '')
    .trim()
}

/** Time units that must not be read as a serving count after a matched number. */
const SERVINGS_NOT_TIME =
  '(?!\\s*(?:minutes?|mins?|hours?|hrs?|seconds?|secs?|minuter|timmar?)\\b)'

function detectServings(text: string): string {
  // Do not use English "for" — it matches "cook for 12 minutes". Swedish "för N" is separate.
  const patterns = [
    new RegExp(
      `(?:serves|servings|yield|makes|portions?|portioner)\\D{0,4}(\\d{1,3})${SERVINGS_NOT_TIME}`,
      'i',
    ),
    new RegExp(
      `(\\d{1,3})\\s*(?:servings|portions|portioner|people|personer)\\b${SERVINGS_NOT_TIME}`,
      'i',
    ),
    new RegExp(`\\bför\\s+(\\d{1,3})\\b${SERVINGS_NOT_TIME}`, 'i'),
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) return m[1]
  }
  return ''
}

function looksLikeIngredient(line: string): boolean {
  const l = line.trim()
  if (!l) return false
  if (MEASURE.test(l)) return true
  // Short, comma-listy, no sentence-ending period, few words.
  const words = l.split(/\s+/).length
  const endsSentence = /[.!?]$/.test(l)
  return words <= 8 && l.length <= 60 && !endsSentence
}

type HeaderBlock = { ingIdx: number; stepIdx: number; latin: boolean }

/** Pair each Ingredients header with the following Steps header in the same block. */
function findRecipeBlocks(lines: string[]): HeaderBlock[] {
  const ingHeaders: number[] = []
  const stepHeaders: number[] = []
  lines.forEach((l, i) => {
    if (isIngredientsHeader(l)) ingHeaders.push(i)
    if (isStepsHeader(l)) stepHeaders.push(i)
  })

  const blocks: HeaderBlock[] = []
  for (let i = 0; i < ingHeaders.length; i++) {
    const ingIdx = ingHeaders[i]!
    const nextIng = ingHeaders[i + 1] ?? Number.POSITIVE_INFINITY
    const stepIdx = stepHeaders.find((s) => s > ingIdx && s < nextIng)
    if (stepIdx === undefined) continue
    blocks.push({
      ingIdx,
      stepIdx,
      latin: isLatinRecipeHeader(lines[ingIdx]!) && isLatinRecipeHeader(lines[stepIdx]!),
    })
  }
  return blocks
}

/** Prefer a Latin (usually English) block when bilingual text has more than one. */
function chooseRecipeBlock(blocks: HeaderBlock[]): HeaderBlock | null {
  if (blocks.length === 0) return null
  return blocks.find((b) => b.latin) ?? blocks[0]!
}

/** Parse pasted recipe text into editable form fields. */
export function parseRecipeText(text: string): ParsedText {
  const rawLines = text.split(/\r?\n/).map((l) => l.trim())
  const lines = rawLines.filter((l) => l.length > 0 && !isChrome(l))
  const servings = detectServings(text)

  const block = chooseRecipeBlock(findRecipeBlocks(lines))
  let ingIdx = block?.ingIdx ?? -1
  let stepIdx = block?.stepIdx ?? -1

  // Incomplete header sets (only ingredients or only steps) — keep prior behaviour.
  if (!block) {
    lines.forEach((l, i) => {
      if (ingIdx === -1 && isIngredientsHeader(l)) ingIdx = i
      if (stepIdx === -1 && isStepsHeader(l)) stepIdx = i
    })
  }

  let title = ''
  const ingredients: string[] = []
  const steps: string[] = []

  if (ingIdx !== -1 || stepIdx !== -1) {
    // Header-driven split (the reliable case).
    const firstHeader = Math.min(...[ingIdx, stepIdx].filter((n) => n !== -1))
    title = lines.slice(0, firstHeader).find((l) => !isRecipeHeader(l)) ?? ''

    const ingEnd = stepIdx > ingIdx ? stepIdx : lines.length
    if (ingIdx !== -1) {
      for (const l of lines.slice(ingIdx + 1, ingEnd)) {
        if (isRecipeHeader(l) || SECTION_DIVIDER.test(l)) continue
        ingredients.push(stripBullet(l))
      }
    }
    if (stepIdx !== -1) {
      for (const l of lines.slice(stepIdx + 1)) {
        // Divider or a new Ingredients header → outro / another language block.
        if (SECTION_DIVIDER.test(l) || isIngredientsHeader(l)) break
        if (isStepsHeader(l)) continue
        steps.push(stripBullet(l))
      }
    }
  } else {
    // No headers: classify line by line. First line is the title.
    title = lines[0] ?? ''
    for (const l of lines.slice(1)) {
      const isNumbered = /^\s*(?:[\d\u0660-\u0669\u06F0-\u06F9]+)[.)]\s+/.test(l)
      if (isNumbered) steps.push(stripBullet(l))
      else if (looksLikeIngredient(l)) ingredients.push(stripBullet(l))
      else steps.push(stripBullet(l))
    }
  }

  return {
    title: title.trim(),
    servings,
    ingredients: ingredients.filter(Boolean).join('\n'),
    steps: steps.filter(Boolean).join('\n'),
  }
}
