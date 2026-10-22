import { test, expect } from '@playwright/test'

// A page with no recipe markup at all (no JSON-LD, no microdata) whose recipe
// sits in a WordPress table with <br>-separated cells, the shape of issue #24.
// Instead of a dead "No recipe found", the import lands in the editor
// pre-filled, with the link kept. /api/proxy is mocked: no live network.

const TABLE_PAGE = `<!doctype html><html><head><title>Long Bean Spread – Some Vegan Blog</title>
<meta property="og:site_name" content="Some Vegan Blog" />
<meta property="og:title" content="Long Bean Spread – Borboti Bhorta" />
</head><body><article>
<p>Borboti was one of my least favorite vegetables as a kid.</p>
<figure class="wp-block-table"><table><tbody>
<tr><td>Recipe: Borboti bhorta</td></tr>
<tr><td>Ingredients: <br>Long beans – 200g<br>Onion- 1 medium<br>Garlic- 8 big cloves<br>Oil<br>Salt</td></tr>
<tr><td>1. Toast the chili, onion and garlic in a pan. <br>2. Cut the beans into small pieces. <br>Serve with white rice.</td></tr>
</tbody></table></figure>
<p>Imagine it with warm rice on a rainy day!</p>
</article></body></html>`

const NOT_A_RECIPE = `<!doctype html><html><head><title>My trip</title></head><body><article><h1>My trip to Lisbon</h1><p>We ate a lot. 2 pastries a day.</p></article></body></html>`

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('recipe-jar')
        req.onsuccess = req.onerror = req.onblocked = () => resolve()
      })
  )
  await page.reload()
})

test('a page without recipe markup lands in the editor pre-filled, link kept', async ({ page }) => {
  await page.route('**/api/proxy*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: TABLE_PAGE })
  )
  await page.getByLabel('Recipe URL').fill('https://example.com/2024/02/25/longbeanspread/')
  await page.getByLabel('Recipe URL').press('Enter')

  await expect(page.getByRole('heading', { level: 1, name: 'Add or paste a recipe' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('no recipe markup')
  await expect(page.getByLabel('Recipe name')).toHaveValue('Long Bean Spread – Borboti Bhorta')
  await expect(page.getByLabel(/Ingredients/)).toHaveValue(/Long beans – 200g\nOnion- 1 medium/)
  await expect(page.getByLabel(/Steps/)).toHaveValue(/^Toast the chili.*\nCut the beans.*\nServe with white rice\.$/s)
  // The blogger's closing line after the table is not a step.
  await expect(page.getByLabel(/Steps/)).not.toHaveValue(/rainy day/)

  await page.getByRole('button', { name: 'Create recipe' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Long Bean Spread – Borboti Bhorta' })).toBeVisible()
  await expect(page.getByText('Long beans – 200g')).toBeVisible()
  await expect(page.getByRole('link', { name: 'source' })).toHaveAttribute('href', 'https://example.com/2024/02/25/longbeanspread/')
})

test('importing the same page again shows the saved copy, not a second editor', async ({ page }) => {
  await page.route('**/api/proxy*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: TABLE_PAGE })
  )
  await page.getByLabel('Recipe URL').fill('https://example.com/2024/02/25/longbeanspread/')
  await page.getByLabel('Recipe URL').press('Enter')
  await page.getByRole('button', { name: 'Create recipe' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Long Bean Spread – Borboti Bhorta' })).toBeVisible()

  await page.goto('/')
  await page.getByLabel('Recipe URL').fill('https://example.com/2024/02/25/longbeanspread/')
  await page.getByLabel('Recipe URL').press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Long Bean Spread – Borboti Bhorta' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Add or paste a recipe' })).toHaveCount(0)
})

test('a page that was never a recipe still says so', async ({ page }) => {
  await page.route('**/api/proxy*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: NOT_A_RECIPE })
  )
  await page.getByLabel('Recipe URL').fill('https://example.com/lisbon')
  await page.getByLabel('Recipe URL').press('Enter')
  await expect(page.getByRole('alert')).toContainText('No recipe found on that page.')
})
