#!/bin/sh
cd "$(dirname "$0")/../data/tiles" || exit 1
xargs -P 12 -n 1 sh -c 'f=$(basename "$0"); [ -s "$f" ] || curl -s -f --retry 3 -o "$f" "$0" || echo "FAIL $f"' < ../tiles.txt
echo DONE
