# Browser Journeys

Load this reference when the repo overlay binds a browser runner for journey
tests. The examples use Playwright syntax; translate them if the overlay names a
different browser driver. Nothing here is required by IDD — the journey map and
its traceability are the methodology; this file is one stack's execution of it.

## Test file template

```typescript
// {e2e-root}/journeys/{journey-name}.spec.ts

import { test, expect } from '@playwright/test';
import { authenticateAs } from '../support/auth';
import { api } from '../support/api';
import { fixtures } from '../support/fixtures';

/**
 * Journey: {Journey Title}
 * Source: specs/journeys/{journey-name}.md
 * Map: specs/journey-maps/{journey-name}.map.yaml
 * Stories:
 *   - specs/stories/{area}/{story}.md
 * Features:
 *   - specs/features/{area}/{feature}.feature
 */
test.describe('Journey: {Journey Title}', () => {
  let resourceId: string;

  test.beforeEach(async ({ page, request }) => {
    await authenticateAs(page, '{persona-type}');
    const response = await api.post(request, '/resource', fixtures.resource);
    resourceId = response.id;
  });

  test.afterEach(async ({ request }) => {
    await api.delete(request, `/resource/${resourceId}`);
  });

  test('Step 1: {Step Title}', async ({ page }) => {
    await page.goto('/path');
    await page.getByTestId('button').click();
    await expect(page.getByTestId('element')).toBeVisible();
  });
});
```

## Selector strategy

Use `data-testid` attributes for stable selectors:

```html
<button data-testid="create-audit-cta">Create Audit</button>
<input data-testid="entity-name-input" />
```

```yaml
# In the journey map
- type: click
  target: "[data-testid='create-audit-cta']"
```

**Naming**: `{component}-{element}` (`create-audit-cta`), scoped as
`{feature}-{component}-{element}` for repeated components, and `{item}-{index}`
for list items.

**Never select on**: CSS classes (styling changes break tests), DOM structure
(refactoring breaks tests), or visible text (localization breaks tests).

## Support files

### Fixture loader

```typescript
// {e2e-root}/support/fixtures.ts
import createAudit from '../../../specs/fixtures/audits/create-audit.json';

export const fixtures = {
  audit: {
    create: createAudit.request,
    createExpected: createAudit.response,
  },
};
```

Load fixtures from `specs/` rather than duplicating the data in test code.

### Session helper

```typescript
// {e2e-root}/support/auth.ts
import { Page } from '@playwright/test';

type Persona = 'new-user' | 'existing-user' | 'admin';

export async function authenticateAs(page: Page, persona: Persona) {
  const session = await signIn(getTestCredentials(persona));
  await page.context().addCookies([
    { name: 'session', value: session.token, domain: 'localhost', path: '/' },
  ]);
}
```

Credentials come from the test environment's seeded users. How a session is
established is the repository's concern — cookie, header, or storage state —
and the overlay names the identity provider if one is involved.

### API helper

```typescript
// {e2e-root}/support/api.ts
import { APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.API_URL ?? 'http://localhost:8080/api/v1';

export const api = {
  async get(request: APIRequestContext, path: string) {
    return (await request.get(`${BASE_URL}${path}`)).json();
  },
  async post(request: APIRequestContext, path: string, body: unknown) {
    return (await request.post(`${BASE_URL}${path}`, { data: body })).json();
  },
  async delete(request: APIRequestContext, path: string) {
    await request.delete(`${BASE_URL}${path}`);
  },
};
```

## Runner configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.PW_VIDEO === '1' ? 'on' : 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: '{api start command}', url: '{api health url}', reuseExistingServer: !process.env.CI },
    { command: '{app start command}', url: '{app url}', reuseExistingServer: !process.env.CI },
  ],
});
```

Prefer config or environment settings over CLI flags for video capture; flag
support varies by version. The start commands belong to the repository, so take
them from the overlay's test commands rather than inventing them.

## Browser guardrails

- Register `page.route(...)` mocks before the first `page.goto(...)`.
- Mock background and guard requests the page issues, not only the primary
  journey endpoints.
- No sleeps: wait on a response, a locator state, or a polling assertion.
- Clean up resources the test created.

## Common patterns

### Waiting for async work

```typescript
const responsePromise = page.waitForResponse(r =>
  r.url().includes('/api/audits') && r.request().method() === 'POST'
);
await page.getByTestId('submit').click();
expect((await responsePromise).status()).toBe(201);

await expect(page.getByTestId('result')).toBeVisible({ timeout: 10000 });
await expect(page).toHaveURL(/\/audits\/[\w-]+/);

await expect(async () => {
  const data = await api.get(request, `/audits/${auditId}`);
  expect(data.status).toBe('completed');
}).toPass({ timeout: 30000 });
```

### Inputs that clear during re-render

Frameworks that re-render on each change can drop a typed value. Fill such
fields defensively:

```typescript
export const fillStable = async (page: Page, testId: string, value: string) => {
  const input = page.getByTestId(testId);
  await expect(input).toBeVisible();
  await expect(input).toBeEditable();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await input.click();
    await input.press('ControlOrMeta+A');
    await input.fill(value);
    if ((await input.inputValue()) !== value) continue;
    await page.waitForTimeout(100);
    if ((await input.inputValue()) === value) return;
  }

  await expect.poll(async () => input.inputValue(), { timeout: 10000 }).toBe(value);
};
```

Setting `.value` through `locator.evaluate(...)` is a last resort: it bypasses
the events the application listens for.

### Error states and confirmations

```typescript
test('Step 2: shows an error on invalid input', async ({ page }) => {
  await page.goto('/audits/new');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('entity-name-error')).toContainText('required');
  await expect(page).toHaveURL('/audits/new');
});

test('Step 3: confirms before a destructive action', async ({ page }) => {
  await page.getByTestId('delete-btn').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('cancel-btn').click();
  await expect(page.getByTestId('confirm-dialog')).toBeHidden();
});
```

## Visual regression

Pixel comparison catches layout breakage, clipping, and rendering defects that
functional assertions miss. Add it for pages with grid or flex layouts, text
that can truncate, or explicit design requirements.

```typescript
export default defineConfig({
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
});
```

```typescript
test('Visual: {page} layout renders correctly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/path');
  await expect(page.getByTestId('page-root')).toBeVisible();
  await expect(page).toHaveScreenshot('{page}-full.png', { fullPage: true });
});
```

Assertion-based layout checks catch the same defects without baselines:

```typescript
const box = await page.getByTestId('sidebar').boundingBox();
expect(box!.width).toBeGreaterThanOrEqual(280);
await expect(component.getByText('Full Title Text')).toBeVisible();
```

**Visual guardrails**: prefix these tests with `Visual:`, set the viewport
explicitly, disable animations, generate baselines only from verified-correct
rendering, and store snapshots outside version control unless the repository
has a baseline service.

## CI

```yaml
e2e:
  steps:
    - uses: actions/checkout@v4
    - name: Install browsers
      run: npx playwright install --with-deps
    - name: Run journey tests
      run: npx playwright test e2e/journeys/
    - name: Upload report
      uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: journey-report
        path: playwright-report/
```
