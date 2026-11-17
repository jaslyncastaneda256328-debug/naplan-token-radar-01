# Token Radar — a token-radar-01 entry

A radar for pre-token protocols: it reads a sealed DefiLlama snapshot,
ranks the protocols that record no token by what a launch would be worth,
and hands in a dashboard with a farm plan for each one.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes the
ranked board to `out/board.json`, the dashboard's data to `out/data.js`,
copies `dashboard/` and `screenshots/` to `out/`, and writes
`out/dossier.json` with `buildDossier` from `vendor/makefun-board.ts`.

## The model (radar-2)

Implied value = TVL × sector multiple × growth factor × maturity factor ×
chain factor. Every factor comes from the snapshot's own figures; no
protocol name is special-cased. The board covers all 40 watchlist protocols
plus every other rankable pre-token protocol below the floor (158 early
finds, 198 rows in all). Live-token protocols are kept apart and shown at
their market value. The dashboard recomputes every row from the same model
and checks the board's number, so the page and the board can never disagree.

See the methodology section at the bottom of the dashboard for the full
sector-multiple table and the eligibility rules.

## Layout

- `main.ts` — the entrypoint
- `lib/model.ts` — the model, the farm plans, the board
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte
- `dashboard/` — the static page (no network, no framework)
- `screenshots/` — the board, a detail view, a filtered view (1440×800)
