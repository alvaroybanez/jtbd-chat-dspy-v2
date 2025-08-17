# AGENT.md — JTBD Assistant Platform

- Build/run (web): npm i; npm run dev; npm run build; npm start; lint: npm run lint; types: npm run typecheck. No test runner configured yet.
- Single test (after adding Vitest): npm i -D vitest; run all: npx vitest; single: npx vitest -t "name" or npx vitest path/to/file.test.ts -t "name".
- Structure: Next.js app in [src/app](file:///Users/alvaro.ybanez/workspace/github.com/ybaniez/jtbd-chat-dspy-v2/src/app); API route at [src/app/api/v1/chat/route.ts](file:///Users/alvaro.ybanez/workspace/github.com/ybaniez/jtbd-chat-dspy-v2/src/app/api/v1/chat/route.ts).
- Lib/config: [src/lib/config.ts](file:///Users/alvaro.ybanez/workspace/github.com/ybaniez/jtbd-chat-dspy-v2/src/lib/config.ts) (envs + timeouts) and [src/lib/supabase.ts](file:///Users/alvaro.ybanez/workspace/github.com/ybaniez/jtbd-chat-dspy-v2/src/lib/supabase.ts).
- Python service (DSPy/FastAPI): [dspy-service/main.py](file:///Users/alvaro.ybanez/workspace/github.com/ybaniez/jtbd-chat-dspy-v2/dspy-service/main.py) with endpoints /api/intelligence/generate_hmw and /api/intelligence/create_solutions (x-api-key); health at /health.
- Run Python: cd dspy-service; pip install -r requirements.txt; uvicorn main:app --reload. Config in [dspy-service/config.py](file:///Users/alvaro.ybanez/workspace/github.com/ybaniez/jtbd-chat-dspy-v2/dspy-service/config.py).
- Database: Supabase Postgres + pgvector; migrations in [supabase/migrations](file:///Users/alvaro.ybanez/workspace/github.com/ybaniez/jtbd-chat-dspy-v2/supabase/migrations) (base tables, HMW/solutions, vector indexes, RPC search functions, seeds).
- Key schema: documents, document_chunks, insights, metrics, jtbds, hmws, solutions (vector(1536), ivfflat indexes; relationship arrays; constraints).
- Env (web): OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, DSPY_SERVICE_URL (default http://localhost:8000), DSPY_API_KEY.
- Env (python): OPENAI_API_KEY, API_KEY, optional DSPY_CONFIG, HOST, PORT.
- Code style (TypeScript): strict mode per [tsconfig.json](file:///Users/alvaro.ybanez/workspace/github.com/ybaniez/jtbd-chat-dspy-v2/tsconfig.json); path alias '@/*'; ESNext modules; no emit.
- Conventions: explicit imports/exports (no wildcards), no magic numbers (use constants), fail fast on invalid input, functions small and single-responsibility, files ≤500 LOC.
- Observability: emit logs/metrics/traces for components; design for testability (pure functions, DI where sensible).
- Security: zero-trust inputs; never log secrets; use env/config over hardcoding; idempotent operations when possible.
- Naming: TypeScript uses lowerCamelCase for vars/functions; PascalCase for components/types; SQL uses snake_case columns and comments explain constraints.
- API style: Next.js route returns JSON; Python uses Pydantic/FastAPI; communicate over HTTP with x-api-key and timeouts (30s default in config).
- Rules: See [CLAUDE.md](file:///Users/alvaro.ybanez/workspace/github.com/ybaniez/jtbd-chat-dspy-v2/CLAUDE.md) for repository-wide guidelines (SoC, DRY, YAGNI, FP, composition>inheritance, config-over-code).
- Missing pieces to add next: choose a test runner (Vitest/Jest) and wire chat orchestration + Supabase RPC usage; keep to constraints above.
