[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Barkie303/csv-reader-speed-01-run-20261121-v1/rank.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Barkie303/csv-reader-speed-01-run-20261121-v1/reward.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)

# Read broken CSV files faster

A fast drop-in for csv-reader 1.0.0, entered in
[csv-reader-speed-01-run-20261121](https://make.fun/c/csv-reader-speed-01-run-20261121)
on [make.fun](https://make.fun). `run(input)` returns exactly what csv-reader returns for
`{text, header}` — `{columns, rows, errors}` — including every broken-row case: BOM drop,
LF/CRLF, stray CRs, quoted fields with doubled quotes, quote junk, unterminated quotes, and
short/long rows with their error records.

The reference walks the text one character at a time. This reader jumps between delimiters
with `indexOf`, slices fields out whole, and only slows down for the rare broken piece:

- unquoted fields end at the nearest of comma, LF, or CR, found with native scans; the next
  LF and CR positions are cached lazily so a rare CR never makes a field scan the rest of
  the text;
- quoted fields find their closing quote with one `indexOf`, count the line breaks inside
  only when the span holds one, and turn CRLF/lone CR into LF only when the span holds a CR;
- `main.ts` runs with V8's incremental marking off, the same flag the house driver uses.

## Layout

- `solve.js` — the reader: dependency-free ES module, `run(input)` is the whole contract.
- `main.ts` — the driver the harness runs: reads `/input/cases.json`, answers each case
  with `run`, writes `/output/answers.json`.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=<cases dir> MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT. See `LICENSE`.
