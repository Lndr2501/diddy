{
  description = "Diddy — native Matrix desktop client for NixOS";

  inputs.nixpkgs.url = "https://channels.nixos.org/nixpkgs-unstable/nixexprs.tar.zst";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      pkgsFor = system: import nixpkgs { inherit system; };
    in
    {
      packages = forAllSystems (system:
        let
          diddy = (pkgsFor system).callPackage ./nix/package.nix { };
        in
        {
          inherit diddy;
          default = diddy;
          # With a WebRTC-enabled WebKitGTK (built from source, takes hours): needed for calls.
          diddy-webrtc = diddy.override { withWebRTC = true; };
        });

      apps = forAllSystems (system:
        let
          app = {
            type = "app";
            program = "${self.packages.${system}.diddy}/bin/diddy";
            meta.description = "Diddy Matrix desktop client";
          };
        in
        {
          default = app;
          diddy = app;
        });

      checks = forAllSystems (system: {
        package = self.packages.${system}.diddy;
        frontend = self.packages.${system}.diddy.frontend;
      });

      overlays.default = final: prev: {
        diddy = final.callPackage ./nix/package.nix { };
      };

      devShells = forAllSystems (system:
        let
          pkgs = pkgsFor system;
          diddy = self.packages.${system}.diddy;
        in
        {
          default = pkgs.mkShell {
            inputsFrom = [ diddy diddy.frontend ];
            packages = with pkgs; [
              nodejs_24
              cargo
              rustc
              rustfmt
              clippy
              cargo-tauri
              xdg-utils
            ];
            HUSKY = "0";
            GIO_EXTRA_MODULES = "${pkgs.glib-networking}/lib/gio/modules";
            shellHook = ''
              export XDG_DATA_DIRS="${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:''${XDG_DATA_DIRS:-}"
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [ pkgs.webkitgtk_4_1 pkgs.gtk3 pkgs.openssl ]}:''${LD_LIBRARY_PATH:-}"
              export GST_PLUGIN_SYSTEM_PATH_1_0="${pkgs.lib.makeSearchPath "lib/gstreamer-1.0" [ pkgs.gst_all_1.gst-plugins-base pkgs.gst_all_1.gst-plugins-good pkgs.gst_all_1.gst-plugins-bad pkgs.gst_all_1.gst-libav pkgs.libnice pkgs.pipewire ]}:''${GST_PLUGIN_SYSTEM_PATH_1_0:-}"
            '';
          };
        });

      formatter = forAllSystems (system: (pkgsFor system).nixfmt);
    };
}
