---
name: e2e-journey-testing
description: "End-to-end test development from user journeys. Use when creating or updating e2e tests that validate user journeys. Consumes journey narratives and journey maps from specs/, produces Playwright tests in frontend."
argument-hint: "[journey-name]"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
---

# E2E Journey Testing

## Purpose

Translate user journeys into executable end-to-end tests. Ensures the full user experience works as designed across the frontend/backend boundary.

## Workflow

1. Locate journey narrative in specs/journeys/.
2. Locate or create journey map in specs/journey-maps/.
3. Implement e2e test following the map.
4. Validate all journey steps are covered.
5. Ensure tests are independent and repeatable.
6. Register route mocks before first navigation.
7. Use stable input patterns for reactive forms (`toBeEditable` + retry + value stability check).

## Traceability Requirements

- Journey map must reference the journey and any stories it covers.
- E2E test header must reference journey, map, stories, and features.
- Tests must use fixtures from specs/ when available and cite their source.

## Artifact Locations

**Specs directory (source of truth):**

```
specs/
├── journeys/
│   └── {journey-name}.md              ← narrative
└── journey-maps/
    └── {journey-name}.map.yaml        ← test bridge
```

**Frontend directory (implementation):**

```
frontend/
└── e2e/
    ├── journeys/
    │   └── {journey-name}.spec.ts     ← executable test
    └── support/
        ├── fixtures.ts                ← loaded from specs/fixtures
        ├── auth.ts                    ← Supabase auth helpers
        └── api.ts                     ← API helpers
```

## Journey Map Schema

The journey map bridges narrative to technical implementation:

```yaml
# specs/journey-maps/{journey-name}.map.yaml

journey: {journey-name}                  # matches journey filename
description: {purpose of this journey}
sources:
  journey: specs/journeys/{journey-name}.md
  stories:
    - specs/stories/{area}/{story}.md
  features:
    - specs/features/{area}/{feature}.feature

preconditions:
  auth: {persona-type}                   # or 'none' for unauthenticated
  state: {description}                   # any required setup

steps:
  {step-id}:                             # kebab-case identifier
    journey_step: {number}               # reference to journey doc
    title: "{step title}"                # matches journey heading
    
    setup:                               # optional pre-step setup
      - type: api
        method: POST
        endpoint: /resource
        body: "{{fixtures.resource}}"
        capture: resourceId              # save for later use
    
    actions:                             # user interactions
      - type: navigate
        url: "/path/{{resourceId}}"
      - type: click
        target: "[data-testid='button-name']"
      - type: fill
        target: "[data-testid='input-name']"
        value: "{{fixtures.fieldValue}}"
      - type: select
        target: "[data-testid='select-name']"
        value: "{option-value}"
      - type: wait
        for: networkidle | selector | timeout
        value: "{selector or ms}"
    
    assertions:                          # verifications
      - type: visible
        selector: "[data-testid='element']"
        description: "Element is visible"
      - type: hidden
        selector: "[data-testid='element']"
      - type: text
        selector: "[data-testid='element']"
        contains: "{partial text}"
        # or: equals: "{exact text}"
      - type: url
        pattern: "{regex or exact path}"
      - type: api
        endpoint: "{METHOD} {path}"
        expected_status: {code}
        expected_body:                   # partial match
          field: value
      - type: count
        selector: "[data-testid='item']"
        equals: {number}
      - type: polling
        endpoint: "{path}"
        until:
          field: {json path}
          equals: {value}
        timeout: {duration}

fixtures:
  {name}:
    ref: specs/fixtures/{path}.json      # from specs
  {name}:
    inline:                              # or inline for simple cases
      field: value

cleanup:                                 # optional teardown
  - type: api
    method: DELETE
    endpoint: "/resource/{{resourceId}}"
```

## Test File Template

```typescript
// frontend/e2e/journeys/{journey-name}.spec.ts

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
  
  // Captured values from setup
  let resourceId: string;

  test.beforeEach(async ({ page, request }) => {
    // Auth setup per preconditions
    await authenticateAs(page, '{persona-type}');
    
    // State setup if needed
    const response = await api.post(request, '/resource', fixtures.resource);
    resourceId = response.id;
  });

  test.afterEach(async ({ request }) => {
    // Cleanup if needed
    await api.delete(request, `/resource/${resourceId}`);
  });

  test('Step 1: {Step Title}', async ({ page }) => {
    // Navigate
    await page.goto('/path');
    
    // Actions
    await page.getByTestId('button').click();
    
    // Assertions
    await expect(page.getByTestId('element')).toBeVisible();
    await expect(page.getByTestId('status')).toContainText('expected');
  });

  test('Step 2: {Step Title}', async ({ page }) => {
    // Continue journey...
  });

  // Edge cases as separate tests
  test('Edge: {Edge case description}', async ({ page }) => {
    // Test edge case...
  });
});
```

## Selector Strategy

Use `data-testid` attributes for stable selectors:

```html
<!-- In Angular component template -->
<button data-testid="create-audit-cta">Create Audit</button>
<input data-testid="entity-name-input" />
<div data-testid="audit-status">{{ audit.status }}</div>
```

```yaml
# In journey map
- type: click
  target: "[data-testid='create-audit-cta']"
```

**Naming convention:**
- Simple: `{component}-{element}` → `create-audit-cta`
- Scoped: `{feature}-{component}-{element}` → `dashboard-audit-list-item`
- Lists: `{item}-{index}` or use `:nth-child()` → `audit-item-0`

**Never use:**
- CSS classes (styling changes break tests)
- DOM structure (refactoring breaks tests)
- Text content for selection (i18n breaks tests)

## Support Files

### Fixtures Loader

```typescript
// frontend/e2e/support/fixtures.ts

// Import from specs directory
import createAudit from '../../../specs/fixtures/audits/create-audit.json';
import cancelAudit from '../../../specs/fixtures/audits/cancel-audit.json';

export const fixtures = {
  audit: {
    create: createAudit.request,
    createExpected: createAudit.response,
    cancel: cancelAudit.request,
  }
};
```

### Auth Helpers

```typescript
// frontend/e2e/support/auth.ts

import { Page } from '@playwright/test';

type Persona = 'new-user' | 'existing-user' | 'admin';

export async function authenticateAs(page: Page, persona: Persona) {
  // Get test credentials for persona
  const credentials = getTestCredentials(persona);
  
  // Authenticate with Supabase
  const session = await supabaseAuth(credentials);
  
  // Set session in browser
  await page.context().addCookies([
    {
      name: 'sb-access-token',
      value: session.access_token,
      domain: 'localhost',
      path: '/',
    },
    {
      name: 'sb-refresh-token', 
      value: session.refresh_token,
      domain: 'localhost',
      path: '/',
    }
  ]);
}

function getTestCredentials(persona: Persona) {
  // Return test user credentials based on persona
  // These should be seeded in test environment
  const users = {
    'new-user': { email: 'new@test.local', password: 'test123' },
    'existing-user': { email: 'existing@test.local', password: 'test123' },
    'admin': { email: 'admin@test.local', password: 'test123' },
  };
  return users[persona];
}
```

### API Helpers

```typescript
// frontend/e2e/support/api.ts

import { APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.API_URL || 'http://localhost:8080/api/v1';

export const api = {
  async get(request: APIRequestContext, path: string) {
    const response = await request.get(`${BASE_URL}${path}`);
    return response.json();
  },
  
  async post(request: APIRequestContext, path: string, body: unknown) {
    const response = await request.post(`${BASE_URL}${path}`, {
      data: body,
    });
    return response.json();
  },
  
  async delete(request: APIRequestContext, path: string) {
    await request.delete(`${BASE_URL}${path}`);
  },
  
  async waitFor(
    request: APIRequestContext,
    path: string,
    condition: (data: unknown) => boolean,
    timeout = 30000
  ) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const data = await this.get(request, path);
      if (condition(data)) return data;
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error(`Timeout waiting for condition on ${path}`);
  }
};
```

## Playwright Configuration

```typescript
// frontend/playwright.config.ts

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.PW_VIDEO === '1' ? 'on' : 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'cd ../backend && ./mvnw spring-boot:run',
      url: 'http://localhost:8080/actuator/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run start',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

Note: prefer config/env for video capture. `npx playwright test --video=on` is not supported by all Playwright CLI versions.

## Guardrails

- One spec file per journey.
- One test per journey step (can have substeps within).
- Tests must be independent—no reliance on other test state.
- Use fixtures from specs/, don't duplicate data.
- Selectors use data-testid, never CSS classes or DOM structure.
- Register `page.route(...)` mocks before `page.goto(...)`.
- Mock background/guard requests used by the page, not only primary journey endpoints.
- API assertions verify contract compliance.
- No sleeps—use waitFor, polling, or network idle.
- Clean up created resources after tests.

## CI Integration

```yaml
# In CI workflow
e2e:
  needs: [backend-build, frontend-build]
  steps:
    - uses: actions/checkout@v4
    
    - name: Install dependencies
      run: |
        cd frontend
        npm ci
        npx playwright install --with-deps
    
    - name: Run e2e tests
      run: |
        cd frontend
        npx playwright test e2e/journeys/
      env:
        API_URL: http://localhost:8080/api/v1
    
    - name: Upload test results
      uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: frontend/playwright-report/
```

## Validation Checklist

Before merging:

- [ ] Every journey step has a corresponding test
- [ ] All map assertions are implemented
- [ ] Fixtures loaded from specs/ (not duplicated)
- [ ] No hardcoded test data
- [ ] Tests pass independently (no order dependence)
- [ ] Selectors use data-testid
- [ ] Route mocks registered before navigation
- [ ] Flaky form fields use stable fill strategy
- [ ] API calls verified against contract
- [ ] Cleanup happens in afterEach
- [ ] Tests pass in CI
- [ ] Visual regression tests added for complex layouts (see Visual Regression Testing section)

## Traceability

Always include references in test file header:

```typescript
/**
 * Journey: First Time User Creates Audit
 * Source: specs/journeys/first-time-user.md
 * Map: specs/journey-maps/first-time-user.map.yaml
 * Stories:
 *   - specs/stories/audits/create-first-audit.md
 *   - specs/stories/onboarding/welcome-dashboard.md
 * Features:
 *   - specs/features/audits/create-audit.feature
 *   - specs/features/dashboard/empty-state.feature
 */
```

This creates the full chain:
```
Persona → Journey → Story → Feature → Contract → Map → E2E Test
```

## Common Patterns

### Waiting for Async Operations

```typescript
// Wait for API response
const responsePromise = page.waitForResponse(r =>
  r.url().includes('/api/audits') && r.request().method() === 'POST'
);
await page.getByTestId('submit').click();
const response = await responsePromise;
expect(response.status()).toBe(201);

// Wait for element
await expect(page.getByTestId('result')).toBeVisible({ timeout: 10000 });

// Wait for navigation
await expect(page).toHaveURL(/\/audits\/[\w-]+/);

// Poll API until condition
await expect(async () => {
  const data = await api.get(request, `/audits/${auditId}`);
  expect(data.status).toBe('completed');
}).toPass({ timeout: 30000 });
```

### Stable Form Filling (Angular Reactive Forms)

Use this for fields that sometimes clear during rerender/change-detection ticks:

```typescript
import { expect, type Page } from '@playwright/test';

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

Use `locator.evaluate(...)` to set `.value` only as a last resort.

### Testing Error States

```typescript
test('Step 2: Shows error on invalid input', async ({ page }) => {
  await page.goto('/audits/new');
  
  // Submit without required field
  await page.getByTestId('submit').click();
  
  // Verify error displayed
  await expect(page.getByTestId('entity-name-error')).toBeVisible();
  await expect(page.getByTestId('entity-name-error')).toContainText('required');
  
  // Verify no navigation occurred
  await expect(page).toHaveURL('/audits/new');
});
```

### Testing Confirmation Dialogs

```typescript
test('Step 3: Confirms before destructive action', async ({ page }) => {
  await page.goto(`/audits/${auditId}`);

  // Open confirmation
  await page.getByTestId('delete-btn').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();

  // Dismiss
  await page.getByTestId('cancel-btn').click();
  await expect(page.getByTestId('confirm-dialog')).toBeHidden();

  // Confirm
  await page.getByTestId('delete-btn').click();
  await page.getByTestId('confirm-btn').click();

  // Verify action completed
  await expect(page).toHaveURL('/audits');
});
```

## Visual Regression Testing

Visual regression tests catch layout issues, text clipping, and rendering defects that functional tests miss. Add these whenever creating pages/components with complex layouts.

### When to Add Visual Tests

Add visual regression tests when:
- Creating new pages or major components
- Components have grid/flex layouts that could break on viewport changes
- Components contain text that could be truncated/clipped
- The design has specific visual requirements (spacing, alignment, typography)

### Playwright Configuration for Visual Testing

Add snapshot configuration to `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // ... existing config ...

  // Snapshot configuration for visual regression testing
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01, // Allow 1% pixel difference for minor rendering variations
      animations: 'disabled',
    },
  },
});
```

### Visual Test Template

Create visual tests in the same spec file as journey tests, with `Visual:` prefix:

```typescript
test.describe('Journey: {Journey Title}', () => {
  // ... functional tests ...

  test('Visual: {Page/Component} layout renders correctly', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // Set consistent viewport for visual testing
    await page.setViewportSize({ width: 1440, height: 900 });

    // Disable animations for stable screenshots
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `,
    });

    // Navigate to page (follow journey, don't skip auth/setup)
    await page.goto('/path');
    await expect(page.getByTestId('page-root')).toBeVisible();

    // Full page screenshot
    await expect(page).toHaveScreenshot('{page}-full.png', {
      fullPage: true,
    });

    // Component-level screenshots for targeted regression detection
    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveScreenshot('{page}-sidebar.png');
  });
});
```

### Layout Validation Tests

Beyond pixel comparison, add assertion-based tests that catch common layout defects:

```typescript
test('Visual: {Component} text is not clipped or truncated', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/path');

  const component = page.getByTestId('component');
  await expect(component).toBeVisible();

  // Verify key text content is fully visible (fails if truncated)
  await expect(component.getByText('Full Title Text')).toBeVisible();
  await expect(component.getByText(/Expected description text/i)).toBeVisible();

  // Verify minimum dimensions (catches grid/flex collapse issues)
  const box = await component.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(280);  // Minimum readable width
  expect(box!.height).toBeGreaterThanOrEqual(100); // Minimum content height
});
```

### Common Layout Defects to Test For

1. **Grid/Flex Collapse**: Angular component host elements can break CSS Grid. Test minimum widths.
2. **Text Truncation**: Narrow containers clip text. Assert full text visibility.
3. **Overflow Issues**: Content escaping containers. Take component screenshots.
4. **Responsive Breakpoints**: Test at key viewports (mobile, tablet, desktop).

### Responsive Visual Testing

Test critical breakpoints:

```typescript
const viewports = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const vp of viewports) {
  test(`Visual: {Page} renders correctly on ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/path');
    await expect(page).toHaveScreenshot(`{page}-${vp.name}.png`, { fullPage: true });
  });
}
```

### Angular-Specific: Host Element Fix

Angular components render with a host element (`<app-component>`) that defaults to `display: block`. This breaks CSS Grid child positioning (e.g., `lg:col-span-4` won't work).

**Fix**: Add `display: contents` to the host:

```typescript
@Component({
  selector: 'app-sidebar',
  standalone: true,
  templateUrl: './sidebar.component.html',
  // Fix: Makes host "invisible" to grid, allowing inner grid classes to work
  host: { style: 'display: contents' }
})
export class SidebarComponent {}
```

**Test for this defect**:

```typescript
test('Visual: Sidebar has correct grid width', async ({ page }) => {
  const sidebar = page.getByTestId('sidebar');
  const box = await sidebar.boundingBox();
  // Should be ~33% of 12-col grid (col-span-4), not collapsed to content width
  expect(box!.width).toBeGreaterThanOrEqual(280);
});
```

### Visual Test Guardrails

- **Naming**: Prefix visual tests with `Visual:` for easy filtering
- **Viewport**: Always set explicit viewport size for reproducibility
- **Animations**: Disable via CSS injection or `reducedMotion`
- **Screenshots**: Prefer viewport screenshots; use `fullPage: true` only when necessary for stability
- **Snapshot Paths**: Store in `e2e/__screenshots__/` (gitignored by default)
- **Baselines**: Generate with `--update-snapshots` after verifying correct rendering
- **CI**: Screenshots regenerate on first CI run; Chromatic recommended for persistent baselines

### Validation Checklist (Visual)

Before merging visual tests:

- [ ] Visual tests prefixed with `Visual:`
- [ ] Viewport explicitly set
- [ ] Animations disabled
- [ ] Component-level screenshots for complex layouts
- [ ] Dimension assertions for grid/flex containers
- [ ] Key text visibility assertions
- [ ] Baselines generated from verified-correct rendering
