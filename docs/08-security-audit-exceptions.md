# Security audit exceptions

Last reviewed: 2026-07-30

## DEV-2026-001 — ESLint/minimatch brace-expansion DoS

- Advisory: [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg)
- Severity: high
- Scope: development dependencies only
- Affected chain: `eslint` / `eslint-config-next` and their lint plugins through `minimatch` and `brace-expansion`
- Production audit: `npm audit --omit=dev --audit-level=high` reports zero vulnerabilities

### Why this is temporarily accepted

`eslint-config-next@16.2.12` currently installs lint plugins whose declared peer range ends at ESLint 9. The npm audit remediation proposes ESLint 10 or an incompatible downgrade of `eslint-config-next`. A forced major upgrade was rejected because it breaks the supported peer contract and previously broke the lint command.

The advisory is a denial-of-service condition triggered by adversarial brace-expansion patterns. This project does not accept user-controlled lint patterns: ESLint runs only against repository-owned configuration and paths in a read-only CI job.

### Compensating controls

- Production dependencies remain a blocking zero-high/zero-critical audit gate.
- `npm run audit:all-policy` allows only this exact advisory and the current exact affected package set.
- Any new high/critical advisory or newly affected package fails CI.
- CI uses a lockfile install, read-only repository permissions, and repository-owned lint configuration.

### Removal condition

Remove this exception as soon as the Next.js lint plugin chain supports a patched dependency set without forcing unsupported majors. Recheck on every Next.js or ESLint upgrade and no later than 2026-10-30.

## DEV-2026-002 — Drizzle Kit legacy esbuild loader

- Advisory: [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
- Severity: moderate
- Scope: development dependencies only
- Affected chain: `drizzle-kit@0.31.10` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild@0.18.20`
- Production audit: `npm audit --omit=dev --audit-level=high` reports zero vulnerabilities

### Why this is temporarily accepted

The latest stable Drizzle Kit still depends on the deprecated loader chain. The advisory concerns websites sending requests to an exposed esbuild development server. This project uses Drizzle Kit only as a local/CI migration generator and metadata checker; it does not start or expose an esbuild development server.

The current alternatives are forcing an unverified transitive esbuild override or moving the database toolchain to a Drizzle 1.0 release candidate. Neither is appropriate for the initial production schema without compatibility evidence.

### Compensating controls and removal condition

- Drizzle Kit remains a devDependency and is not bundled into the production application.
- Production dependency audit remains zero high/critical.
- Migration SQL is executed in PGlite integration tests and checked by `drizzle-kit check`.
- Remove the exception when a stable Drizzle Kit release removes the legacy loader. Recheck on every Drizzle upgrade and no later than 2026-10-30.
