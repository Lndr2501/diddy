import Compression
import Foundation

/// Unpacks the deflated entries of a ZIP with the Compression framework. `COMPRESSION_ZLIB` reads
/// the raw deflate stream a ZIP entry holds (no zlib header). The output buffer is as large as the
/// entry says it is (and never above the limit), so a ZIP that lies about its size cannot make the
/// app allocate or write more.
struct DiddyAppleInflater: DiddyInflater {
    func inflate(_ data: Data, expectedSize: Int, limit: Int) throws -> Data {
        if expectedSize > limit { throw DiddyZipError("A file in this ZIP is too large.") }
        if expectedSize <= 0 { return Data() }
        let capacity = expectedSize + 1
        var output = Data(count: capacity)
        let written: Int = output.withUnsafeMutableBytes { (destination: UnsafeMutableRawBufferPointer) -> Int in
            data.withUnsafeBytes { (source: UnsafeRawBufferPointer) -> Int in
                guard let target = destination.bindMemory(to: UInt8.self).baseAddress,
                      let input = source.bindMemory(to: UInt8.self).baseAddress, source.count > 0 else { return 0 }
                return compression_decode_buffer(target, capacity, input, source.count, nil, COMPRESSION_ZLIB)
            }
        }
        if written == 0 { throw DiddyZipError("This ZIP file is damaged.") }
        if written > expectedSize { throw DiddyZipError("A file in this ZIP is too large.") }
        return Data(output.prefix(written))
    }
}
