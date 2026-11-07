fn main() {
    // The ScreenCaptureKit bridge (screencapturekit crate) is written in Swift. Without an rpath
    // to the system Swift runtime the app aborts at launch with
    // "Library not loaded: @rpath/libswift_Concurrency.dylib".
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg-bins=-Wl,-rpath,/usr/lib/swift");
    }

    // Custom commands must be declared so they can be granted to the page (see capabilities/app-commands.json).
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&[
                "set_app_icon",
                "diag_log",
                "log_path",
                "open_log_folder",
                "myinstants_fetch_text",
                "myinstants_fetch_audio",
                "connection_profiles",
                "open_connection_profile",
            ])),
    )
    .expect("failed to run tauri-build");
}
