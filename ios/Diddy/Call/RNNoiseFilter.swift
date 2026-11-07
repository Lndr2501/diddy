import Foundation

/// RNNoise on one channel of 10 ms audio frames, cleaned in place.
///
/// RNNoise only works on 480 samples at 48 kHz. WebRTC normally delivers exactly that; a frame of
/// another length is stretched to 480 samples and back, which is simple and good enough for the
/// rare case that the audio pipeline runs at a lower rate.
final class RNNoiseFilter {
    /// Samples are in 16-bit range (-32768...32767), which is what WebRTC and RNNoise both use.
    static let frameSize = 480

    private let state: OpaquePointer
    private let input = UnsafeMutablePointer<Float>.allocate(capacity: RNNoiseFilter.frameSize)
    private let output = UnsafeMutablePointer<Float>.allocate(capacity: RNNoiseFilter.frameSize)
    private var lastInput: Float = 0
    private var lastOutput: Float = 0

    /// Nil if RNNoise could not load its model.
    init?() {
        guard let state = rnnoise_create(nil) else {
            input.deallocate()
            output.deallocate()
            return nil
        }
        self.state = state
    }

    deinit {
        rnnoise_destroy(state)
        input.deallocate()
        output.deallocate()
    }

    func process(_ samples: UnsafeMutablePointer<Float>, count: Int) {
        guard count > 0 else { return }
        if count == Self.frameSize {
            input.update(from: samples, count: count)
            rnnoise_process_frame(state, samples, input)
            return
        }
        Self.stretch(from: samples, count: count, previous: lastInput, to: input, count: Self.frameSize)
        lastInput = samples[count - 1]
        rnnoise_process_frame(state, output, input)
        Self.stretch(from: output, count: Self.frameSize, previous: lastOutput, to: samples, count: count)
        lastOutput = output[Self.frameSize - 1]
    }

    /// Linear interpolation. `previous` is the last sample of the frame before, which keeps the
    /// seam between frames smooth.
    private static func stretch(from source: UnsafePointer<Float>, count sourceCount: Int, previous: Float,
                                to target: UnsafeMutablePointer<Float>, count targetCount: Int) {
        for index in 0..<targetCount {
            let position = Float(index + 1) * Float(sourceCount) / Float(targetCount) - 1
            let lower = Int(position.rounded(.down))
            let fraction = position - Float(lower)
            let before = lower < 0 ? previous : source[lower]
            let after = source[min(lower + 1, sourceCount - 1)]
            target[index] = before + (after - before) * fraction
        }
    }
}
