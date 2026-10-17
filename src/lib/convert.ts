// Metric display for ingredient lines and method steps, on the card / cook
// mode only. Two honesty rules govern ingredient lines: exact unit conversions
// (oz, lb) carry no marker, while cup-to-grams goes through a curated density
// table and is marked with ≈ because a cup of flour depends on how you scoop
// it. Anything the table does not know keeps its cup as exact millilitres, and
// spoons (tsp/tbsp) are left alone: they are already universal. Method text
// gets the same mass/volume honesty where amounts appear in prose, plus exact
// °F→°C and inch→cm. The shopping list never converts (see mergelist's
// no-guessing stance); this module is display-only and loads lazily.

import { UNIT_ALIAS_TABLE } from './mergelist'

const ML_PER: Record<string, number> = { cup: 240, dl: 100, l: 1000 }
const G_PER: Record<string, number> = { oz: 28.35, lb: 453.6 }

// Grams per US cup, common staples only, deliberately curated: a wrong
// density is worse than showing millilitres. Multi-word keys are checked
// before their single-word substrings ("brown sugar" before "sugar").
const DENSITY_PER_CUP: Array<[string, number]> = [
  ['powdered sugar', 120],
  ['icing sugar', 120],
  ['brown sugar', 220],
  ['caster sugar', 225],
  ['sugar', 200],
  ['whole wheat flour', 120],
  ['bread flour', 127],
  ['chickpea flour', 92],
  ['besan', 92],
  ['almond flour', 96],
  ['cornflour', 128],
  ['cornstarch', 128],
  ['flour', 120],
  ['rolled oats', 90],
  ['oats', 90],
  ['cocoa', 100],
  ['peanut butter', 258],
  ['butter', 227],
  ['ghee', 218],
  ['oil', 218],
  ['honey', 340],
  ['maple syrup', 322],
  ['golden syrup', 340],
  ['yogurt', 245],
  ['yoghurt', 245],
  ['curd', 245],
  ['sour cream', 230],
  ['heavy cream', 240],
  ['cream', 240],
  ['milk', 245],
  ['water', 240],
  ['breadcrumbs', 110],
  ['semolina', 167],
  ['sooji', 167],
  ['basmati rice', 195],
  ['rice', 185],
  ['lentils', 200],
  ['dal', 200],
  ['quinoa', 170],
  ['couscous', 175],
  ['raisins', 145],
  ['chocolate chips', 170],
]

// Kilograms and litres read as plain decimals ("1.4 kg"), never the unicode
// fractions formatQty prefers: nobody weighs out 1⅜ kg.
function bigUnit(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '')
}

function roundG(g: number): string {
  if (g >= 1000) return `${bigUnit(g / 1000)} kg`
  if (g >= 20) return `${Math.round(g / 5) * 5} g`
  return `${Math.round(g)} g`
}

function roundMl(ml: number): string {
  if (ml >= 1000) return `${bigUnit(ml / 1000)} l`
  if (ml >= 20) return `${Math.round(ml / 5) * 5} ml`
  return `${Math.round(ml)} ml`
}

/** The density (g/cup) for an item description, or null when unknown. */
export function densityFor(item: string): number | null {
  const t = item.toLowerCase()
  for (const [keyword, grams] of DENSITY_PER_CUP) {
    if (t.includes(keyword)) return grams
  }
  return null
}

/**
 * A metric rendering of "qty unit item", or null when the line should stay
 * as written (already metric, a spoon, unitless, or an unknown unit).
 * `qtyEnd` carries a range's upper bound.
 */
export function metricLine(qty: number | null, qtyEnd: number | null, rest: string): string | null {
  if (qty === null) return null
  const m = rest.match(/^(\S+)\s+(.*)$/)
  if (!m) return null
  const unit = UNIT_ALIAS_TABLE[m[1].toLowerCase().replace(/\.$/, '')]
  if (!unit) return null
  const item = m[2].trim().replace(/^of\s+/i, '')

  if (unit in G_PER) {
    const lo = roundG(qty * G_PER[unit])
    const hi = qtyEnd !== null ? `–${roundG(qtyEnd * G_PER[unit])}` : ''
    return `${lo}${hi} ${item}`
  }

  if (unit === 'cup') {
    const density = densityFor(item)
    if (density !== null) {
      const lo = roundG(qty * density)
      const hi = qtyEnd !== null ? `–${roundG(qtyEnd * density)}` : ''
      return `≈ ${lo}${hi} ${item}`
    }
  }

  if (unit in ML_PER) {
    // dl and l are already metric; only cups need the translation.
    if (unit !== 'cup') return null
    const lo = roundMl(qty * ML_PER.cup)
    const hi = qtyEnd !== null ? `–${roundMl(qtyEnd * ML_PER.cup)}` : ''
    return `${lo}${hi} ${item}`
  }

  return null
}

/** °F → °C. Oven-range temps round to the nearest 5°C; lower temps to 1°C. */
function fahrenheitToCelsiusLabel(f: number): string {
  const c = ((f - 32) * 5) / 9
  if (f >= 250) return `${Math.round(c / 5) * 5}°C`
  return `${Math.round(c)}°C`
}

function inchesToCmLabel(n: number): string {
  const cm = n * 2.54
  if (cm >= 10) return `${Math.round(cm)} cm`
  return `${(Math.round(cm * 10) / 10).toFixed(1).replace(/\.0$/, '')} cm`
}

function massFromImperial(qty: number, unitRaw: string): string | null {
  const unit = UNIT_ALIAS_TABLE[unitRaw.toLowerCase().replace(/\.$/, '')]
  if (!unit || !(unit in G_PER)) return null
  return roundG(qty * G_PER[unit])
}

/**
 * Display-only metric rewrite of a method step. Leaves minutes and spoons
 * alone. Temperatures, imperial mass, cups (≈ when density known, else ml),
 * and inch dimensions are converted in place.
 */
export function metricStepText(text: string): string {
  let out = text

  // 400°F / 400 °F / 400 degrees Fahrenheit
  out = out.replace(
    /(\d+(?:\.\d+)?)\s*(?:°\s*)?F(?:ahrenheit)?\b|(\d+(?:\.\d+)?)\s*degrees?\s*F(?:ahrenheit)?\b/gi,
    (full, a: string | undefined, b: string | undefined) => {
      const n = parseFloat(a ?? b ?? '')
      if (!Number.isFinite(n)) return full
      return fahrenheitToCelsiusLabel(n)
    },
  )

  // 9×13 / 9x13 baking dish (inches implied)
  out = out.replace(
    /(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)(?:\s*(?:inches|inch|in\.?))?\b/gi,
    (full, a: string, b: string) => {
      const w = parseFloat(a)
      const h = parseFloat(b)
      if (!Number.isFinite(w) || !Number.isFinite(h)) return full
      const left = inchesToCmLabel(w).replace(/ cm$/, '')
      const right = inchesToCmLabel(h)
      return `${left}×${right}`
    },
  )

  out = out.replace(/(\d+(?:\.\d+)?)\s*(?:inches|inch|in\.)\b/gi, (full, a: string) => {
    const n = parseFloat(a)
    if (!Number.isFinite(n)) return full
    return inchesToCmLabel(n)
  })

  out = out.replace(
    /(\d+(?:\.\d+)?)\s*(oz|ounces?|lbs?|pounds?)\b/gi,
    (full, qtyStr: string, unitRaw: string) => {
      const qty = parseFloat(qtyStr)
      if (!Number.isFinite(qty)) return full
      const mass = massFromImperial(qty, unitRaw)
      return mass ?? full
    },
  )

  out = out.replace(
    /(\d+(?:\.\d+)?)\s*(cups?)\b(?:\s+of)?\s+([a-z][\w'-]*(?:\s+[a-z][\w'-]*){0,3})/gi,
    (full, qtyStr: string, _unit: string, item: string) => {
      const qty = parseFloat(qtyStr)
      if (!Number.isFinite(qty)) return full
      const density = densityFor(item)
      if (density !== null) return `≈ ${roundG(qty * density)} ${item}`
      return `${roundMl(qty * ML_PER.cup)} ${item}`
    },
  )

  return out
}
