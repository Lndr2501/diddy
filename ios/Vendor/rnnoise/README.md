# RNNoise

Noise suppression for the iOS microphone, see `Diddy/Call/NoiseSuppressor.swift`.

- Source: https://github.com/xiph/rnnoise, release v0.2 (`rnnoise-0.2.tar.gz`,
  SHA-256 `90fce4b00b9ff24c08dbfe31b82ffd43bae383d85c5535676d28b0a2b11c0d37`)
- Licence: BSD-3-Clause, see `COPYING`
- Only the files for ARM are kept (no x86 code, no tools, no examples).
- One change: v0.2 does not compile on ARM because `vec.h` and `vec_neon.h` include a missing
  `os_support.h`. They use `RNN_CLEAR` from `common.h` instead, as upstream did in commit `372f7b4b`.
