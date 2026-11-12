#!/bin/sh
A=${1:-chesapeake_mouth}
cd "$(dirname "$0")/../data/$A/tiles" || exit 1
xargs -P 12 -n 1 sh -c 'f=$(basename "$0"); [ -s "$f" ] || curl -s -f --retry 3 -o "$f" "$0" || echo "FAIL $f"' < ../tiles.txt
cd ../enc && for s in VA MD; do [ -s ${s}_ENCs.zip ] || curl -s -f -o ${s}_ENCs.zip https://charts.noaa.gov/ENCs/${s}_ENCs.zip; unzip -q -o ${s}_ENCs.zip; done
echo DONE
