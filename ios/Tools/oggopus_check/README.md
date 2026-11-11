Run from `ios/` on macOS or Linux with Swift 6.1 (Swift 5 language mode):

```sh
swiftc -swift-version 5 Diddy/Matrix/OpusContainer.swift Diddy/Matrix/OpusCAFWriter.swift Tools/oggopus_check/main.swift -o /tmp/oggopus_check
/tmp/oggopus_check
```

The Foundation checks cover CRC's independent `123456789` vector, headers, packets spanning
pages (including the zero lacing terminator), pre-skip/end trim, corrupt/truncated pages,
size/packet limits, live WebM SimpleBlock and BlockGroup with DiscardPadding, rejected WebM
lacing, the decoder cookie, and CAF PCM gain/clipping/interleaving. Optional file arguments
check real Ogg/WebM encoder fixtures. They do **not** exercise Apple's decoder.

Desktop chooses from `RECORDER_MIMES` in `cinny/src/app/plugins/voiceMessage.ts` with
`MediaRecorder.isTypeSupported`: Ogg/Opus first, WebM/Opus next, MP4/AAC last. Availability
depends on the runtime. Safari's AAC remains native. The cache detects containers by bytes,
including files downloaded by previous versions and encrypted media decrypted by the SDK.

Decoder API references (checked 2026-11-11):

- [AVAudioCompressedBuffer initializer](https://developer.apple.com/documentation/avfaudio/avaudiocompressedbuffer/init(format:packetcapacity:maximumpacketsize:))
- [Nullable packetDescriptions](https://developer.apple.com/documentation/avfaudio/avaudiocompressedbuffer/packetdescriptions)
- [Nonoptional raw data pointer](https://developer.apple.com/documentation/avfaudio/avaudiocompressedbuffer/data)
- [Converter input callback and status](https://developer.apple.com/documentation/avfaudio/avaudioconverter/convert(to:error:withinputfrom:))
- [Converter magicCookie](https://developer.apple.com/documentation/avfaudio/avaudioconverter/magiccookie)
- [ASBD format initializer](https://developer.apple.com/documentation/avfaudio/avaudioformat/init(streamdescription:))
- [PCM buffer initializer](https://developer.apple.com/documentation/avfaudio/avaudiopcmbuffer/init(pcmformat:framecapacity:)-5jhd5)
- [Packet description fields](https://developer.apple.com/documentation/coreaudiotypes/audiostreampacketdescription)
- [CAF byte layout and flags](https://developer.apple.com/library/archive/documentation/MusicAudio/Reference/CAFSpec/CAF_spec/CAF_spec.html)

The iOS 16-compatible Core Audio cookie consists of seven big-endian 32-bit fields, as
shown in Apple's [WebKit implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/cocoa/WebMAudioUtilitiesCocoa.mm)
(`cookieFromOpusCookieContents`, `CoreAudioOpusHeader`). Pre-skip/gain are applied once by our
PCM sink. Each supplied compressed buffer owns one complete packet with offset 0, its actual
byte size and sample count; the converter persists across packets to retain prediction state.

Deliberate limits: mapping family 0, mono/stereo, fixed packet duration (as desktop recorder
output normally uses); WebM laced blocks and chained Ogg streams are not decoded. Unknown-size
WebM Segment/Cluster and ordinary SimpleBlock/BlockGroup are supported. Unsupported inputs
follow the existing visible player error path. Apple conversion and playback still need an
Xcode/iOS 16 build and device test; Linux fixtures cannot establish those results.
