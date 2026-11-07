{
  lib,
  stdenv,
  pkg-config,
  libpulseaudio,
  buildNpmPackage,
  importNpmLock,
  nodejs_24,
  electron,
  alsa-lib,
  makeWrapper,
  makeDesktopItem,
  copyDesktopItems,
  jq,
}:
# Diddy on Linux: the Cinny-based frontend in Electron (Chromium). The Tauri build uses the system
# web engine, which on Linux is WebKitGTK; its GStreamer WebRTC cannot run Element Call (no frame
# encryption, so no encrypted calls at all). Chromium brings libwebrtc, like WKWebView on macOS.
# Nothing big is compiled here: Electron comes from the binary cache, only the frontend is built.
let
  version = (lib.importJSON ../src-tauri/tauri.conf.json).version;

  # Keep frontend inputs independent of Electron/Rust changes. Ancestor directories
  # must remain traversable, while ignored/generated files never enter either source.
  sourceFor = name: paths: lib.cleanSourceWith {
    inherit name;
    src = ../.;
    filter = path: type:
      let
        relative = lib.removePrefix "${toString ../.}/" (toString path);
        included = builtins.any (wanted:
          relative == wanted
          || lib.hasPrefix "${wanted}/" relative
          || lib.hasPrefix "${relative}/" wanted
        ) paths;
      in
      lib.cleanSourceFilter path type
      && (toString path == toString ../. || included)
      && !(builtins.elem (baseNameOf path) [ "node_modules" "dist" "target" ".claude" ]);
  };

  frontendSrc = sourceFor "diddy-frontend-source" [ "cinny" "config.json" ];
  shellSrc = sourceFor "diddy-shell-source" [
    "electron"
    "src-tauri/app-icons"
    "src-tauri/icons"
    "src-tauri/tauri.conf.json"
    "LICENSE"
  ];

  frontend = (buildNpmPackage.override { nodejs = nodejs_24; }) {
    pname = "diddy-frontend";
    inherit version;
    src = frontendSrc;
    sourceRoot = "${frontendSrc.name}/cinny";

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
stdenv.mkDerivation {
  pname = "diddy";
  inherit version;
  src = shellSrc;

  nativeBuildInputs = [
    makeWrapper
    copyDesktopItems
    jq
    nodejs_24
    pkg-config
  ];
  buildInputs = [ libpulseaudio ];

  buildPhase = ''
    runHook preBuild
    $CC -std=c11 -O2 -Wall -Wextra -Werror electron/native/system-audio.c \
      -o diddy-system-audio $(pkg-config --cflags --libs libpulse) -lm
    runHook postBuild
  '';

  # Tests of the Electron shell (log, connections, MyInstants, local server); no Electron needed.
  doCheck = true;
  checkPhase = ''
    runHook preCheck
    (cd electron && node --test tests/*.test.cjs)
    runHook postCheck
  '';

  desktopItems = [
    (makeDesktopItem {
      name = "Diddy";
      desktopName = "Diddy";
      comment = "Matrix chat client";
      exec = "diddy %U";
      icon = "diddy";
      categories = [ "Network" "InstantMessaging" ];
      startupWMClass = "Diddy";
    })
  ];

  installPhase = ''
    runHook preInstall

    share=$out/share/diddy
    mkdir -p $share/electron $share/app-icons
    cp -r electron/lib electron/main.cjs electron/preload.cjs electron/pickerPreload.cjs electron/picker.html $share/electron/
    install -Dm755 diddy-system-audio $out/libexec/diddy-system-audio
    jq --arg version "${version}" '.version = $version | del(.scripts)' electron/package.json \
      > $share/electron/package.json
    ln -s ${frontend} $share/frontend
    cp src-tauri/app-icons/{pink,blue,purple,black,magenta}.png $share/app-icons/

    install -Dm644 src-tauri/icons/32x32.png $out/share/icons/hicolor/32x32/apps/diddy.png
    install -Dm644 src-tauri/icons/128x128.png $out/share/icons/hicolor/128x128/apps/diddy.png
    install -Dm644 src-tauri/icons/128x128@2x.png $out/share/icons/hicolor/256x256/apps/diddy.png
    install -Dm644 src-tauri/icons/icon.png $out/share/icons/hicolor/512x512/apps/diddy.png

    # A global LD_LIBRARY_PATH (e.g. for JACK) may point at an alsa-lib from a newer nixpkgs that
    # needs a newer glibc than this Electron; ours goes first so audio keeps working.
    makeWrapper ${lib.getExe electron} $out/bin/diddy \
      --add-flags $share/electron \
      --set DIDDY_AUDIO_HELPER $out/libexec/diddy-system-audio \
      --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath [ alsa-lib ]}

    runHook postInstall
  '';

  passthru = { inherit frontend electron; };

  meta = {
    description = "Matrix chat client based on Cinny";
    homepage = "https://github.com/Lndr2501/diddy";
    license = lib.licenses.agpl3Only;
    mainProgram = "diddy";
    platforms = [ "x86_64-linux" "aarch64-linux" ];
  };
}
