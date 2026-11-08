{
  lib,
  stdenvNoCC,
  fetchurl,
}:
# OPT-IN, NOT part of the default `diddy` package. Apple's emoji artwork is proprietary and may not
# be redistributed, so Diddy neither ships nor bundles it. This derivation only fetches the
# community build of Apple Color Emoji (https://github.com/samuelngs/apple-emoji-ttf) on the
# machine of the user who asks for it, for personal use. Diddy picks the font up automatically
# when it is installed ("Apple Color Emoji" is first in its emoji font stack).
stdenvNoCC.mkDerivation rec {
  pname = "apple-color-emoji";
  version = "macos-26-20260722-484daf4e";

  src = fetchurl {
    url = "https://github.com/samuelngs/apple-emoji-ttf/releases/download/${version}/AppleColorEmoji-Linux.ttf";
    hash = "sha256-43x69iZaxKCvbVe8ZehhCad22ZZug0MzRVf2PaSCUW8=";
  };

  dontUnpack = true;
  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    install -Dm444 $src $out/share/fonts/truetype/AppleColorEmoji.ttf
    runHook postInstall
  '';

  meta = {
    description = "Apple Color Emoji font (community build), opt-in for personal use with Diddy";
    homepage = "https://github.com/samuelngs/apple-emoji-ttf";
    # Apple's artwork: proprietary, not redistributable. Needs allowUnfree = true.
    license = lib.licenses.unfree;
    platforms = lib.platforms.all;
  };
}
