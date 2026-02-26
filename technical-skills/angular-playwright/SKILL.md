---
name: angular-playwright
description: "Playwright end-to-end testing for Angular apps using the narrative-driven specs system (journeys, journey-maps, stories, features, fixtures). Use whenever an e2e test is requested or updated, especially for journey-driven flows."
---

# Angular Playwright

## Overview

Implement and maintain Playwright e2e tests for Angular by following the narrative-driven specs chain (journey → journey map → stories → features → fixtures) and enforcing traceability in test headers.

## Workflow (required)

1) **Locate sources**
   - Journey: `specs/journeys/{journey}.md`
   - Journey map: `specs/journey-maps/{journey}.map.yaml`
   - Stories + features: listed in the journey map `sources`
   - Fixtures: `specs/fixtures/{feature-area}/*.json`

2) **Traceability header**
   - Include `Journey`, `Source`, `Map`, `Stories`, and `Features` in the test file header.

3) **Use fixtures**
   - Import fixtures from `specs/fixtures/` or load them in tests.
   - Do not invent data that already exists in fixtures.

4) **Selectors**
   - Use `data-testid` only. No CSS/class selectors.

5) **Navigation**
   - Do not use `page.goto()` to jump internal steps when the journey specifies user actions.
   - Use real clicks/submits, then `expect(page).toHaveURL(...)`.

6) **Assertions**
   - Match journey map assertions (visible/text/url/api/polling).
   - Prefer locator assertions (`toHaveURL`, `toBeVisible`, `toBeEditable`, `toHaveValue`) over sleeps.

7) **Network mocking order**
   - Register `page.route(...)` mocks before `page.goto(...)`.
   - Mock background requests used by layout/guards (for example token balance calls), not only the main happy-path APIs.

8) **Input stability (Angular reactive forms)**
   - For flaky fields, wait for `toBeEditable()` before filling.
   - Use `ControlOrMeta+A` + `fill()` for cross-platform selection.
   - Validate value stability with `expect.poll(...)` when rerenders can clear input values.
   - Avoid `locator.evaluate(...)` to set `.value` except as a last resort.

## Playwright Config (conditional)

Use env toggles for headed mode and artifacts to stabilize/debug runs:

```ts
// playwright.config.ts
const headed = process.env.PW_HEADED === '1';
const recordVideo = process.env.PW_VIDEO === '1';

export default defineConfig({
  use: {
    headless: !headed,
    launchOptions: headed ? { slowMo: 100 } : undefined,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: recordVideo ? 'on' : 'retain-on-failure',
  },
  timeout: headed ? 60000 : 30000,
});
```

Note: prefer config/env for video. `npx playwright test --video=on` is not supported in all CLI versions.

## Flake-Resistant Fill Helper

```ts
const fillStable = async (page: Page, testId: string, value: string) => {
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

## Test Template

```ts
import { test, expect } from '@playwright/test';

/**
 * Journey: {Journey Title}
 * Source: specs/journeys/{journey}.md
 * Map: specs/journey-maps/{journey}.map.yaml
 * Stories:
 *   - specs/stories/{area}/{story}.md
 * Features:
 *   - specs/features/{area}/{feature}.feature
 */
test.describe('Journey: {Journey Title}', () => {
  test('Step X: {Step Title}', async ({ page }) => {
    // Follow journey map actions + assertions
  });
});
```

## Validation Checklist

- [ ] Test header includes journey/map/stories/features.
- [ ] Steps and assertions match journey map.
- [ ] Fixtures pulled from `specs/fixtures/`.
- [ ] `data-testid` selectors only.
- [ ] No `page.goto()` for internal navigation.
- [ ] Routes are mocked before navigation.
- [ ] Inputs use stable fill pattern on flaky/reactive fields.
