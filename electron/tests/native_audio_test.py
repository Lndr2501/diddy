"""No audio server or hardware required."""
import io
import threading
import unittest
from unittest.mock import patch
from audio_harness import PCMReader, wait_until


class HarnessTests(unittest.TestCase):
    def test_delayed_readiness(self):
        with patch('audio_harness.time.sleep') as sleep:
            results = iter([False, False, 'ready'])
            self.assertEqual(wait_until('server', lambda: next(results)), 'ready')
            self.assertEqual(sleep.call_count, 2)

    def test_timeout_is_named_and_bounded(self):
        with patch('audio_harness.time.monotonic', side_effect=[0, 31]):
            with self.assertRaisesRegex(TimeoutError, 'server timed out'):
                wait_until('server', lambda: False)

    def test_child_failure_is_not_retried(self):
        def check():
            raise RuntimeError('server exited')
        with self.assertRaisesRegex(RuntimeError, 'server exited'):
            wait_until('server', lambda: True, check=check)

    def test_pcm_waits_for_fresh_frames_and_discards_old_audio(self):
        class Stream:
            def __init__(self):
                self.calls = 0
                self.send = threading.Event()
            def read(self, count):
                self.calls += 1
                if self.calls == 1:
                    self.send.wait()
                    return b'oldframe' + b'newframe' * 2
                return b''
        stream = Stream()
        reader = PCMReader(stream)
        original_wait = reader.condition.wait
        def release_and_wait(timeout):
            stream.send.set()
            return original_wait(timeout)
        with patch.object(reader.condition, 'wait', side_effect=release_and_wait):
            self.assertEqual(reader.sample(frames=2, discard=1), b'newframe' * 2)
        reader.thread.join(5)
        self.assertTrue(reader.ended)
        self.assertEqual(reader.total, 24)
        # Completed streams must never return stale data as a new measurement.
        with self.assertRaisesRegex(RuntimeError, 'PCM stream ended'):
            reader.sample(frames=2, discard=1)

    def test_pcm_stall_is_bounded(self):
        class Stream:
            def read(self, count):
                release.wait()
                return b''
        release = threading.Event()
        reader = PCMReader(Stream())
        try:
            with self.assertRaisesRegex(TimeoutError, 'PCM stalled'):
                reader.sample(timeout=0)
        finally:
            release.set()
            reader.thread.join(5)

    def test_pcm_eof_fails_immediately(self):
        reader = PCMReader(io.BytesIO(b'partial'))
        reader.thread.join(5)
        with self.assertRaisesRegex(RuntimeError, 'PCM stream ended'):
            reader.sample()


if __name__ == '__main__':
    unittest.main()
