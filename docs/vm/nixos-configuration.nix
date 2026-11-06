# NixOS-Testsystem für Diddy in einer UTM-VM (Apple Silicon, aarch64-linux).
#
# Einrichten (in der VM, nach der grafischen Installation):
#   sudo cp ~/diddy/docs/vm/nixos-configuration.nix /etc/nixos/configuration.nix
#   sudo cp ~/diddy/docs/vm/flake.nix /etc/nixos/flake.nix
#   # Benutzername und SSH-Schlüssel unten anpassen, dann:
#   sudo nixos-rebuild switch --flake /etc/nixos#diddy-vm
#
# Die von der Installation erzeugte hardware-configuration.nix bleibt unverändert liegen.
# Anleitung: docs/vm-macos.md
# Geprüft (2026-11-07): wertet mit nixos-26.05 und nixos-25.11 fehlerfrei und ohne Warnungen aus
# (`nix eval …toplevel.drvPath`, Diddy durch einen Platzhalter ersetzt); nicht in einer VM gebootet.
{ config, pkgs, lib, diddy, ... }:

{
  imports = [ ./hardware-configuration.nix ];

  # --- Start ---------------------------------------------------------------------------------
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  networking.hostName = "diddy-vm";
  networking.networkmanager.enable = true;

  time.timeZone = "Europe/Zurich";
  i18n.defaultLocale = "de_CH.UTF-8";
  console.keyMap = "sg";

  # --- Desktop: GNOME (Wayland) mit Portalen für Dateiauswahl und Bildschirmfreigabe ----------
  services.xserver.enable = true;
  services.xserver.xkb.layout = "ch";
  services.displayManager.gdm.enable = true;
  services.desktopManager.gnome.enable = true;
  xdg.portal.enable = true; # GNOME bringt xdg-desktop-portal-gnome mit

  # --- Ton: PipeWire (Lautsprecher, Mikrofon, Bildschirmfreigabe) -----------------------------
  services.pulseaudio.enable = false;
  security.rtkit.enable = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    pulse.enable = true;
  };

  # --- UTM-Gastwerkzeuge (Zwischenablage, Fenstergröße, QEMU-Agent) ---------------------------
  services.spice-vdagentd.enable = true;
  services.qemuGuest.enable = true;
  services.spice-webdavd.enable = true;

  # Ordner vom Mac (UTM → Sharing → VirtFS). `nofail`: startet auch ohne Freigabe.
  fileSystems."/mnt/mac" = {
    device = "share";
    fsType = "9p";
    options = [ "trans=virtio" "version=9p2000.L" "rw" "nofail" "x-systemd.automount" ];
  };

  # Testkamera ohne Hardware (optional): danach
  #   gst-launch-1.0 videotestsrc ! v4l2sink device=/dev/video10
  # boot.extraModulePackages = [ config.boot.kernelPackages.v4l2loopback ];
  # boot.kernelModules = [ "v4l2loopback" ];
  # boot.extraModprobeConfig = ''
  #   options v4l2loopback devices=1 video_nr=10 card_label="Diddy Testkamera" exclusive_caps=1
  # '';

  # --- Nix -----------------------------------------------------------------------------------
  nix.settings = {
    experimental-features = [ "nix-command" "flakes" ];
    # Ein Diddy-Build braucht viel RAM: nicht zu viele Jobs gleichzeitig.
    max-jobs = 2;
    cores = 2;
  };

  # --- Benutzer und SSH (nur Schlüssel) -------------------------------------------------------
  users.users.lndr = {
    isNormalUser = true;
    extraGroups = [ "wheel" "networkmanager" "audio" "video" ];
    # Eigenen öffentlichen Schlüssel vom Mac eintragen (cat ~/.ssh/id_ed25519.pub):
    openssh.authorizedKeys.keys = [ ];
  };

  services.openssh = {
    enable = true;
    settings = {
      PasswordAuthentication = false;
      PermitRootLogin = "no";
    };
  };

  # --- Programme -----------------------------------------------------------------------------
  environment.systemPackages = [
    diddy.packages.${pkgs.stdenv.hostPlatform.system}.diddy
  ] ++ (with pkgs; [
    git
    gst_all_1.gstreamer # gst-launch-1.0 für die Testkamera
    gst_all_1.gst-plugins-base
    gst_all_1.gst-plugins-good
    pavucontrol # Mikrofon prüfen
  ]);

  # Wert aus der bei der Installation erzeugten configuration.nix übernehmen und danach nie ändern.
  system.stateVersion = "26.05";
}
