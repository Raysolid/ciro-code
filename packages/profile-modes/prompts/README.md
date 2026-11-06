# Public prompt stubs

These files replace the private `prompts/*.md` when exporting to the open-source
tree (`pnpm run export:opensource`). They keep Ask / Agent / Plan / Debug
contracts short so the monorepo builds and tests, without shipping the full
product prompt text.

Edit the **private** `prompts/` directory for production behavior.
Edit this folder only when the public stub contract needs updating.
