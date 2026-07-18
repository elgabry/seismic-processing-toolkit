# Repository Guidelines

## Project Structure & Module Organization

The application lives in `seismic-processing-toolkit/`. Keep browser code in `src/`: `core/` contains domain types, math, binary helpers, and errors; `io/` handles SEG-Y, sweep, source, and sink formats; `processing/` contains deterministic DSP; `workers/` contains module-worker protocols and execution; `app/`, `ui/`, and `visualization/` contain DOM and rendering code. Keep the preserved legacy viewer under `src/legacy/reference/` and `public/legacy/` unchanged. Tests belong in `tests/unit/`, `tests/integration/`, and `tests/bench/`; small generated fixtures belong in `tests/fixtures/`.

## Build, Test, and Development Commands

Run commands from `seismic-processing-toolkit/` using Node 22.12+ (Node 24 is configured for CI):

```bash
npm ci                 # install exactly from package-lock.json
npm run dev            # start Vite development server
npm run typecheck      # strict TypeScript validation
npm run test           # execute Vitest unit/integration tests
npm run lint           # run ESLint flat configuration
npm run build          # typecheck and emit static dist/ assets
npm run benchmark      # run Vitest benchmarks
```

## Coding Style & Naming Conventions

Use strict TypeScript and native ES modules. Prefer small, focused modules and typed arrays in data paths. Use `camelCase` for values and functions, `PascalCase` for classes/interfaces, and kebab-case filenames such as `segy-trace-index-builder.ts`. Keep DSP and I/O free of DOM access; UI code must use public APIs rather than binary offsets. Preserve raw SEG-Y bytes unless an explicit edit requires a rewrite. ESLint and TypeScript are the source of truth; do not suppress errors with `any`, `@ts-ignore`, or broad casts.

## Testing Guidelines

Use Vitest `*.test.ts` files. Add a regression test beside the relevant area for every parser, codec, writer, correlation, or DSP defect. Generate compact synthetic SEG-Y fixtures rather than committing large data. Test both expected results and failure diagnostics, especially truncation, cancellation, endian conversion, and variable trace lengths.

## Commit & Pull Request Guidelines

This repository has no usable prior Git history to infer a message convention. Use imperative, scoped subjects such as `fix(segy): preserve headers on no-edit export`. Keep commits cohesive. Pull requests should explain behavior changes, list validation commands and results, link relevant issues, and include screenshots for UI changes. Never commit `node_modules/`, `dist/`, or local seismic data.
