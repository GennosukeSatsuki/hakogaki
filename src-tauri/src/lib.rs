#[cfg(not(target_os = "android"))]
use font_kit::source::SystemSource;
use std::collections::HashSet;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_system_fonts() -> Vec<String> {
    #[cfg(not(target_os = "android"))]
    {
        let source = SystemSource::new();
        let mut font_names = HashSet::new();
        
        // Get all font families
        if let Ok(families) = source.all_families() {
            for family in families {
                font_names.insert(family);
            }
        }
        
        // Convert to sorted vector
        let mut fonts: Vec<String> = font_names.into_iter().collect();
        fonts.sort();
        fonts
    }
    #[cfg(target_os = "android")]
    {
        // Android doesn't support font-kit well due to fontconfig dependency
        vec![]
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_system_fonts])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
