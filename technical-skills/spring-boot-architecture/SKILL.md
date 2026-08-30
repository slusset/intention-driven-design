---
name: spring-boot-architecture
description: "Spring Boot backend architecture and testing workflow guidance. Use when implementing or reviewing backend changes in Spring Boot projects, especially to enforce architecture boundaries, package structure, and to decide which Maven test commands to run (e.g., mvn test, mvn clean install)."
license: MIT
argument-hint: "[feature or module]"
allowed-tools: Read Write Glob Grep
---

# Spring Boot Architecture

## Workflow

1. Locate and follow repo architecture docs (e.g., `HEXARCH.md`, `ARCHITECTURE.md`).
2. Keep core business logic isolated from frameworks; enforce package boundaries.
3. Keep adapters thin; move orchestration to use cases; move rules to domain.
4. Verify tests with the project-preferred Maven command:
   - Default to `mvn test` for quick validation.
   - Use `mvn clean install` when the repo workflow or CI expects full build/test.
5. If architectural tests exist (ArchUnit or similar), ensure they pass and don’t introduce boundary violations.

## Architecture Guardrails

- Prefer hexagonal layering when the repo uses it (domain, usecases, ports, adapters).
- Avoid cross-adapter dependencies (HTTP/JMS/JDBC adapters should not depend on each other).
- Keep domain free of framework dependencies.

## Testing Notes

- Check `pom.xml` and README for required profiles or test flags.
- Use the repo’s existing test conventions; do not introduce new test tools unless requested.
