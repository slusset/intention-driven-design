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
   - Prefer explicit waits (`toHaveURL`, `toBeVisible`, `waitForResponse`) over sleeps.

## Playwright Config (conditional)

Use an env toggle for headed mode to stabilize animations/timeouts:

```ts
// playwright.config.ts
const headed = process.env.PW_HEADED === '1';

export default defineConfig({
  use: {
    headless: !headed,
    launchOptions: headed ? { slowMo: 100 } : undefined,
    trace: 'on-first-retry',
  },
  timeout: headed ? 60000 : 30000,
});
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
