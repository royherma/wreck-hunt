#!/bin/sh
cd "$(dirname "$0")"
while true; do
  ../.venv/bin/python -W ignore preview.py >/dev/null 2>&1
  FINE=fine_preview.json ../.venv/bin/python -W ignore rank.py >/dev/null 2>&1
  ALL=1 STATUS=running PROGRESS_LOG=fine_all.log FINE=fine_preview_plus.json ../.venv/bin/python -W ignore export.py 2>&1 | tail -1
  grep -q '^DONE' ../out/chesapeake_mouth/fine_all.log && break
  sleep 120
done
