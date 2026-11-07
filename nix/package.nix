{
  lib,
  buildNpmPackage,
  importNpmLock,
  nodejs_24,
  rustPlatform,
  cargo-tauri,
  pkg-config,
  wrapGAppsHook3,
  jq,
  desktop-file-utils,
  glib-networking,
  openssl,
  gtk3,
  librsvg,
  webkitgtk_4_1,
  gst_all_1,
  libnice,
  pipewire,
  xdg-utils,
  # Voice/video calls need WebRTC in WebKitGTK. The default nixpkgs WebKitGTK has none
  # (ENABLE_WEB_RTC belongs to its experimental features), so `RTCPeerConnection` is
  # missing and Element Call cannot connect. `true` uses WebKitGTK with its experimental
  # features (WebRTC via GStreamer). cache.nixos.org currently has that build for
  # x86_64-linux and aarch64-linux; when it does not, it is built locally (hours).
  withWebRTC ? false,
}:
let
  version = (lib.importJSON ../src-tauri/tauri.conf.json).version;
  webkitgtk = if withWebRTC then webkitgtk_4_1.override { enableExperimental = true; } else webkitgtk_4_1;

  # Only application sources enter the store, never local handovers, credentials,
  # build output or dependencies installed outside Nix.
  src = lib.cleanSourceWith {
    name = "diddy-source";
    src = ../.;
    filter = path: type:
      let
        relative = lib.removePrefix "${toString ../.}/" (toString path);
        top = builtins.head (lib.splitString "/" relative);
      in
      lib.cleanSourceFilter path type
      && (toString path == toString ../. || builtins.elem top [
        "cinny"
        "src-tauri"
        "config.json"
        "LICENSE"
      ])
      && !(builtins.elem (baseNameOf path) [ "node_modules" "dist" "target" ".claude" ]);
  };

  frontend = (buildNpmPackage.override { nodejs = nodejs_24; }) {
    pname = "diddy-frontend";
    inherit version src;
    sourceRoot = "${src.name}/cinny";

    # Use the integrity hashes already recorded in the lockfile. No fake hashes
    # and no network access from the actual build sandbox are needed.
    npmDeps = importNpmLock { npmRoot = ../cinny; };
    npmConfigHook = importNpmLock.npmConfigHook;
    npmFlags = [ "--legacy-peer-deps" ];
    # `canvas` (optional, pulled in by pdfjs-dist) would be compiled from source in
    # the sandbox and fails. Nothing here needs install scripts: esbuild and swc
    # ship their binaries through platform packages locked in package-lock.json.
    npmRebuildFlags = [ "--ignore-scripts" ];

    env = {
      HUSKY = "0";
      NODE_OPTIONS = "--max_old_space_size=4096";
    };

    # Match `npm run tauri`: the desktop configuration replaces Cinny's default.
    postPatch = ''
      cp ../config.json config.json
    '';

    doCheck = true;
    checkPhase = ''
      runHook preCheck
      node --test --test-concurrency=1 tests/*.test.cjs
      runHook postCheck
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p "$out"
      cp -r dist/. "$out/"
      runHook postInstall
    '';
  };
in
rustPlatform.buildRustPackage {
  pname = "diddy";
  inherit version src;
  sourceRoot = "${src.name}/src-tauri";
  cargoLock.lockFile = ../src-tauri/Cargo.lock;

  nativeBuildInputs = [
    cargo-tauri.hook
    pkg-config
    wrapGAppsHook3
    jq
    desktop-file-utils
  ];

  buildInputs = [
    glib-networking
    openssl
    gtk3
    librsvg
    webkitgtk
    gst_all_1.gstreamer
    gst_all_1.gst-plugins-base
    gst_all_1.gst-plugins-good
    gst_all_1.gst-plugins-bad
    gst_all_1.gst-libav
    # ICE transport (nicesrc/nicesink) for GStreamer WebRTC
    libnice
    # Screen sharing through xdg-desktop-portal (pipewiresrc)
    pipewire
  ];

  # Tauri's Nix hook extracts its temporary deb bundle into a native store
  # package, including the desktop entry and icons. It does not install a deb.
  postPatch = ''
    jq --arg frontend "${frontend}" '
      .build.frontendDist = $frontend
      | del(.build.beforeBuildCommand, .build.beforeDevCommand)
      | .bundle.createUpdaterArtifacts = false
    ' tauri.conf.json > tauri.conf.json.tmp
    mv tauri.conf.json.tmp tauri.conf.json
  '';

  preFixup = ''
    gappsWrapperArgs+=(--prefix PATH : ${lib.makeBinPath [ xdg-utils ]})
  '';

  postInstall = ''
    desktop-file-edit --set-comment="Matrix chat client" \
      --set-key=Categories --set-value="Network;InstantMessaging;" \
      "$out/share/applications/Diddy.desktop"
    desktop-file-validate "$out/share/applications/Diddy.desktop"
  '';

  passthru = { inherit frontend webkitgtk withWebRTC; };

  meta = {
    description = "Matrix chat client based on Cinny";
    homepage = "https://github.com/Lndr2501/diddy";
    license = lib.licenses.agpl3Only;
    mainProgram = "diddy";
    platforms = [ "x86_64-linux" "aarch64-linux" ];
  };
}
