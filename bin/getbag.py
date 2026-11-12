import json, os, sys, threading, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

PIECE = 16 * 1024 * 1024
CONN = int(os.environ.get("CONN", "12"))


def size_of(url):
    req = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(req, timeout=60) as r:
        return int(r.headers["Content-Length"])


def get(url, dst, start, end, done, lock, state_path):
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}"})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            if len(data) != end - start + 1:
                raise IOError(f"short read {len(data)}")
            with open(dst, "r+b") as f:
                f.seek(start)
                f.write(data)
            with lock:
                done.add(start)
                json.dump(sorted(done), open(state_path, "w"))
            return len(data)
        except Exception as e:
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"piece {start} failed")


def fetch(url, dst):
    total = size_of(url)
    state_path = dst + ".pieces.json"
    done = set(json.load(open(state_path))) if os.path.exists(state_path) else set()
    if not os.path.exists(dst) or os.path.getsize(dst) != total:
        with open(dst, "wb") as f:
            f.truncate(total)
        done = set()
    starts = [s for s in range(0, total, PIECE) if s not in done]
    lock, t0, got = threading.Lock(), time.time(), 0
    print(f"START {os.path.basename(dst)} {total / 1e6:.0f} MB, {len(starts)} pieces left", flush=True)
    with ThreadPoolExecutor(CONN) as ex:
        futs = [ex.submit(get, url, dst, s, min(s + PIECE, total) - 1, done, lock, state_path) for s in starts]
        for i, fu in enumerate(futs, 1):
            got += fu.result()
            if i % 8 == 0 or i == len(futs):
                el = time.time() - t0
                print(f"{os.path.basename(dst)} {len(done) * PIECE / 1e6:.0f}/{total / 1e6:.0f} MB {got / el / 1e6:.1f} MB/s", flush=True)
    os.remove(state_path)
    print(f"OK {os.path.basename(dst)}", flush=True)


if __name__ == "__main__":
    out = sys.argv[1]
    for url in sys.argv[2:]:
        fetch(url, os.path.join(out, url.rsplit("/", 1)[1]))
    print("DONE", flush=True)
