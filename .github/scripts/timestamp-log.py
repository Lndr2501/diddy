"""Add elapsed seconds to streamed build output without buffering it."""
import sys
import time

started = time.monotonic()
for line in sys.stdin:
    print(f"[{time.monotonic() - started:8.1f}s] {line}", end="", flush=True)
