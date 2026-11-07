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
          # Linux development with the Electron shell (see docs/nixos.md).
          default = pkgs.mkShell {
            inputsFrom = [ diddy.frontend ];
            packages = with pkgs; [
              nodejs_24
              electron
              pkg-config
              libpulseaudio
            ];
            HUSKY = "0";
            shellHook = ''
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [ pkgs.alsa-lib ]}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
            '';
          };
        });

      formatter = forAllSystems (system: (pkgsFor system).nixfmt);
    };
}
