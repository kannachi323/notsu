mod pack_export;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pack_export::save_skin_pack,
            pack_export::save_map_pack
        ])
        .run(tauri::generate_context!())
        .expect("failed to run notsu");
}
