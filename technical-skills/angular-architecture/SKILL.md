---
name: angular-architecture
description: "Angular frontend architecture and testing workflow guidance. Use when implementing or reviewing Angular UI changes to keep architecture consistent, follow Angular module/service patterns, and choose appropriate test commands (e.g., npm test, ng test)."
license: MIT
argument-hint: "[feature or component]"
allowed-tools: Read Write Glob Grep
---

# Angular Architecture

## Workflow

1. Locate and follow repo architecture docs (e.g., `ARCHITECTURE.md`, `docs/`, or ADRs).
2. Keep UI structure consistent: feature modules, shared modules, core services.
3. Prefer services for data access and state; keep components focused on presentation.
4. Verify tests with the project-preferred command:
   - Default to `npm test`.
   - If scripts differ, use the `package.json` test script or `npx ng test`.
5. Ensure lint/build steps still pass if they are part of CI.

## Architecture Guardrails

- Avoid circular dependencies between feature modules.
- Keep shared UI components in shared modules; app-wide singletons in core.
- Keep API clients and state management out of component templates.
- For radio inputs using `formControlName`, ensure the HTML `name` matches the control name to avoid NG01202 in Angular forms.

## Testing Notes

- Check `package.json` scripts for required flags (e.g., `--watch=false`, `--browsers=ChromeHeadless`).
- Follow existing test setup (Karma/Jest) without changing tooling unless requested.

## Playwright (optional)

Use environment flags to switch headed/headless in config:

```ts
// playwright.config.ts
const headed = process.env.PW_HEADED === '1';

export default defineConfig({
  use: {
    headless: !headed,
    launchOptions: headed ? { slowMo: 100 } : undefined,
  },
  timeout: headed ? 60000 : 30000,
});
```
