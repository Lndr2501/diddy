fn main() {
    // The ScreenCaptureKit bridge (screencapturekit crate) is written in Swift. Without an rpath
    // to the system Swift runtime the app aborts at launch with
    // "Library not loaded: @rpath/libswift_Concurrency.dylib".
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg-bins=-Wl,-rpath,/usr/lib/swift");
    }
    tauri_build::build()
}
