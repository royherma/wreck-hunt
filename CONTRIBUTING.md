# Contributing

Thanks for helping find lost ships.

## Setup

```sh
node server.mjs                                   # pages, Sample data, no install
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt   # pipeline
```

## Rules

- **Never commit a position.** No file under `out/`, `data/` or any `private/` folder goes
  in a commit, and no PR, issue or screenshot carries the coordinates of an uncharted lead.
  `.gitignore` covers the folders; you cover the screenshots.
- **Zero dependencies on the page side.** `server.mjs` uses only Node built-ins; pages are
  plain ES modules loaded from `public/`, Three.js from a pinned CDN URL. No build step.
- **Every score explains itself.** A new score part needs a `why` line (what it measured and
  what pulled it below full marks), like the existing ones in `bin/rank.py`.
- **Show it works.** A detection change comes with its recall number before and after
  (`bin/recall.py` on Chesapeake, or `bin/implant.py` where no charted wrecks exist).

## Good first issues

- `bin/hunt.sh <area>`: run steps 1-8 from the README in order, resume where it stopped
- Areas: some scripts still assume `chesapeake_mouth` or UTM 18N (`bin/recall.py`, `bin/*.sh`)
- Sample data: `public/sample/make-sample.mjs` could plant a sunk barge, a reef and a pipeline

## Pull requests

One change per PR, with a screenshot of the page if it touches `public/`.
