"""Bounded waits shared by the real-server test and hardware-free regression tests."""
import threading
import time


def wait_until(description, probe, timeout=30, check=lambda: None):
    deadline = time.monotonic() + timeout
    last = None
    while True:
        check()
        last = probe()
        if last:
            return last
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError(f'{description} timed out after {timeout}s; last result: {last!r}')
        time.sleep(min(0.1, remaining))


class PCMReader:
    """Drain stdout continuously; wait for frames, rather than runner wall-clock speed."""
    def __init__(self, stream):
        self.condition = threading.Condition()
        self.audio = bytearray()
        self.total = 0
        self.ended = False
        self.error = None
        self.stream = stream
        self.thread = threading.Thread(target=self.collect, daemon=True)
        self.thread.start()

    def collect(self):
        try:
            while chunk := self.stream.read(3840):
                with self.condition:
                    self.audio.extend(chunk)
                    self.total += len(chunk)
                    # Retain at most two seconds; total remains monotonic.
                    excess = max(0, len(self.audio) - 48000 * 8 * 2)
                    del self.audio[:(excess // 8) * 8]
                    self.condition.notify_all()
        except Exception as error:
            self.error = error
        finally:
            with self.condition:
                self.ended = True
                self.condition.notify_all()

    def sample(self, frames=48000, discard=24000, timeout=30):
        deadline = time.monotonic() + timeout
        with self.condition:
            target = self.total + (frames + discard) * 8
            while self.total < target:
                if self.ended:
                    raise RuntimeError(f'PCM stream ended at {self.total} bytes: {self.error}')
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError(f'PCM stalled: received {self.total} bytes, expected {target}')
                self.condition.wait(remaining)
            end = len(self.audio) - len(self.audio) % 8
            return bytes(self.audio[end - frames * 8:end])
