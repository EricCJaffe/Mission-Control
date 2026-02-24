# AI Scaffolding

This module contains server-only AI route handlers.

- /api/ai/chat
- /api/ai/patch
- /api/ai/outline
- /api/ai/retrieve

These routes now call the OpenAI API when `OPENAI_API_KEY` is configured.

## Notes
- `OPENAI_API_KEY` must be server-only (never `NEXT_PUBLIC`).
- `OPENAI_MODEL` and `OPENAI_EMBEDDING_MODEL` can override defaults.
