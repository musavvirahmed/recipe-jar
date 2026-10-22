import { describe, it, expect } from 'vitest'
import { rescueFromHtml, htmlToLines } from '../src/lib/rescue'
import { parseRecipeText } from '../src/lib/textparse'

// All HTML below is synthetic and hand-authored for these tests (CC0). The
// first page copies the shape of a WordPress post whose only recipe is a
// table with <br>-separated cells and no recipe markup at all (issue #24).

const WORDPRESS_TABLE = `<!doctype html><html><head>
<title>Long Bean Spread &#8211; Borboti Bhorta &#8211; Some Vegan Blog</title>
<meta property="og:title" content="Long Bean Spread &#8211; Borboti Bhorta" />
<meta property="og:image" content="https://example.com/wp-content/uploads/bhorta.jpg" />
<style>.wp-block-table{border:0}.wp-block-table td{padding:0}</style>
</head><body>
<header class="site-header"><h1>Some Vegan Blog</h1><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
<article>
<p>Borboti was one of my least favorite vegetables as a kid. Serves 2 as a side.</p>
<figure class="wp-block-table"><table class="has-fixed-layout"><tbody>
<tr><td>Recipe: Borboti bhorta /Long Bean Spread</td></tr>
<tr><td>Ingredients: <br>Long beans &#8211; 200g<br>Onion- 1 medium<br>Garlic- 8-9 big cloves<br>Dry red chili- 3/4 pieces<br>Nigella seeds &#8211; 1tsp <br>Oil <br>Salt</td></tr>
<tr><td>1. Lightly toast dry red chili, sliced onion and whole garlic cloves in a pan. Keep them aside. <br>2. Cut off the end part of the beans and cut them into small pieces. <br>3. Blend everything to a semi-smooth paste.<br>Serve with white rice. </td></tr>
</tbody></table></figure>
<p>This is how the bhorta looks. Imagine it with warm rice on a rainy day!</p>
</article>
<div class="jp-relatedposts"><h3>Related</h3><a href="/other">Another Bhorta</a><p>2 cups of something</p></div>
<footer><p>&copy; Some Vegan Blog</p></footer>
</body></html>`

const HEADINGS_AND_LISTS = `<html><head><title>Quick Dal | Home Cooking</title></head><body>
<main><h1>Quick Dal</h1><p>A weeknight staple.</p>
<p><strong>Serves 4</strong></p>
<h2>Ingredients</h2>
<ul><li>1 cup red lentils</li><li>1 tsp turmeric</li><li>&frac12; tsp cumin seeds</li><li>Salt</li></ul>
<h2>Instructions</h2>
<ol><li>Rinse the lentils well.</li><li>Boil with turmeric for 20 minutes.</li></ol>
<h3>Nutrition</h3><p>200 kcal</p>
</main></body></html>`

describe('rescueFromHtml', () => {
  it('reads a WordPress table recipe with <br>-separated cells', () => {
    const r = rescueFromHtml(WORDPRESS_TABLE)
    expect(r).not.toBeNull()
    expect(r!.title).toBe('Long Bean Spread – Borboti Bhorta')
    expect(r!.image).toBe('https://example.com/wp-content/uploads/bhorta.jpg')
    const parsed = parseRecipeText(r!.text)
    expect(parsed.title).toBe('Long Bean Spread – Borboti Bhorta')
    expect(parsed.ingredients.split('\n')).toEqual([
      'Long beans – 200g',
      'Onion- 1 medium',
      'Garlic- 8-9 big cloves',
      'Dry red chili- 3/4 pieces',
      'Nigella seeds – 1tsp',
      'Oil',
      'Salt',
    ])
    expect(parsed.steps.split('\n')).toEqual([
      'Lightly toast dry red chili, sliced onion and whole garlic cloves in a pan. Keep them aside.',
      'Cut off the end part of the beans and cut them into small pieces.',
      'Blend everything to a semi-smooth paste.',
      'Serve with white rice.',
    ])
  })

  it('stops at the related-posts block and never reads nav or footer', () => {
    const r = rescueFromHtml(WORDPRESS_TABLE)!
    expect(r.text).not.toMatch(/Another Bhorta|2 cups of something|Home|About|Some Vegan Blog$/m)
  })

  it('reads headings with lists, carrying servings and the steps header', () => {
    const r = rescueFromHtml(HEADINGS_AND_LISTS)
    expect(r).not.toBeNull()
    expect(r!.title).toBe('Quick Dal')
    expect(r!.image).toBeNull()
    const parsed = parseRecipeText(r!.text)
    expect(parsed.servings).toBe('4')
    expect(parsed.ingredients.split('\n')).toEqual(['1 cup red lentils', '1 tsp turmeric', '½ tsp cumin seeds', 'Salt'])
    expect(parsed.steps.split('\n')).toEqual(['Rinse the lentils well.', 'Boil with turmeric for 20 minutes.'])
    expect(r!.text).not.toMatch(/kcal/)
  })

  it('returns null for a page with no ingredients header', () => {
    const html = '<html><body><article><h1>My trip to Lisbon</h1><p>We ate a lot. 2 pastries a day.</p></article></body></html>'
    expect(rescueFromHtml(html)).toBeNull()
  })

  it('returns null when the list under the header is too thin to be a recipe', () => {
    const html = '<html><body><h2>Ingredients</h2><ul><li>Flour</li><li>Water</li></ul><p>Mix and bake until done.</p></body></html>'
    expect(rescueFromHtml(html)).toBeNull()
  })

  it('returns null when there is a list but no step at all', () => {
    const html = '<html><body><h2>Ingredients</h2><ul><li>1 cup flour</li><li>1 egg</li><li>1 cup milk</li></ul><h3>Related</h3><p>Mix it all.</p></body></html>'
    expect(rescueFromHtml(html)).toBeNull()
  })
})

describe('htmlToLines', () => {
  it('decodes entities and drops script, style and comments', () => {
    const lines = htmlToLines('<style>p{}</style><script>var x=1</script><!-- hi --><p>Salt &amp; pepper &#8211; 1&nbsp;tsp &#x2153; cup</p>')
    expect(lines).toEqual(['Salt & pepper – 1 tsp ⅓ cup'])
  })
})
