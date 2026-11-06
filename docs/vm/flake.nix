# System-Flake der Diddy-Test-VM (gehört nach /etc/nixos/flake.nix).
# Siehe nixos-configuration.nix und docs/vm-macos.md.
{
  description = "NixOS-Test-VM für Diddy (UTM, Apple Silicon)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    # Lokaler, sauberer Diddy-Checkout in der VM (ohne Übergaben/Zugangsdaten):
    # ein `path:`-Input kopiert den ganzen Ordner in den Nix-Store.
    diddy.url = "path:/home/lndr/diddy";
  };

  outputs = { nixpkgs, diddy, ... }: {
    nixosConfigurations.diddy-vm = nixpkgs.lib.nixosSystem {
      system = "aarch64-linux";
      specialArgs = { inherit diddy; };
      modules = [ ./configuration.nix ];
    };
  };
}
