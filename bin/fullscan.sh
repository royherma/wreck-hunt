#!/bin/sh
cd "$(dirname "$0")"
L=../out/chesapeake_mouth/getbag.log
for b in H12668_MB_50cm_MLLW_1of1 H12342_MB_50cm_MLLW_1of1 H12667_MB_50cm_MLLW_1of1 H12866_MB_50cm_MLLW_1of3 H12341_MB_50cm_MLLW_1of1; do
  until grep -q "OK $b.bag" $L; do grep -q Traceback $L && echo "DOWNLOAD FAILED" && exit 1; sleep 30; done
  echo "SCAN $b"
  ../.venv/bin/python -W ignore bagscan.py ../data/chesapeake_mouth/bags/$b.bag 2>&1 | grep -E 'DONE|Error|Traceback'
  ../.venv/bin/python -W ignore localpatch.py ../data/chesapeake_mouth/bags/$b.bag 2>&1 | grep -E 'bumps|OK|Error|Traceback'
  ../.venv/bin/python -W ignore preview.py >/dev/null 2>&1
  FINE=fine_preview.json ../.venv/bin/python -W ignore rank.py >/dev/null 2>&1
  ALL=1 STATUS=running FINE=fine_preview_plus.json ../.venv/bin/python -W ignore export.py 2>&1 | tail -1
done
ALL=1 STATUS=done FINE=fine_preview_plus.json ../.venv/bin/python -W ignore export.py 2>&1 | tail -1
echo FULLSCAN DONE
