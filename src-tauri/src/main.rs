#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  let args: Vec<String> = std::env::args().collect();
  if let Some(code) = app_lib::system_audio_helper(&args) {
    std::process::exit(code);
  }
  app_lib::run();
}