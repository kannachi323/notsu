mod skin_export;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![skin_export::save_skin_pack])
        .run(tauri::generate_context!())
        .expect("failed to run notsu");
}
