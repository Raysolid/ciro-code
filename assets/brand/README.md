# Brand assets

Canonical wordmark SVGs for website / docs. GitHub README keeps PNG `<picture>` under [`../readme/`](../readme/).

| File | Use |
|------|-----|
| `ciro-code.svg` | Light UI — navy ink + blue accents |
| `ciro-code-dark.svg` | Dark UI — light ink + same blue accents (generated) |
| `sync-brand.mjs` | Regenerate dark variant + copy both into `website/public/brand/` and `docs/public/brand/` |

```bash
node assets/brand/sync-brand.mjs
```

Edit `ciro-code.svg`, then run the sync script. Do **not** hand-edit the dark file with PowerShell (`Set-Content` can corrupt UTF-8 and break `<img>` decoding).
