use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

struct ServerProcess(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

const PORT: u16 = 3001;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            // Unconditional (not just debug builds) -- this is a
            // personal-use-only app with no external distribution, and
            // seeing the spawned server's own stdout/stderr (forwarded via
            // log::info!/log::error! below) is the only way to diagnose a
            // startup failure in a release build.
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            let handle = app.handle().clone();

            // GUI-launched macOS apps don't inherit the interactive shell's
            // PATH (~/.zshrc etc. are only sourced for shell sessions), so
            // a bare "bun" command lookup fails with ENOENT even though
            // `which bun` works fine in a terminal -- confirmed by running
            // this binary directly outside a shell with PATH exported.
            // Absolute path, same pragmatic choice as FFMPEG_PATH below.
            let home = std::env::var("HOME").expect("HOME env var not set");
            let bun_path = format!("{home}/.bun/bin/bun");

            let resource_dir = app.path().resource_dir()?;
            let server_dir = resource_dir.join("server-bundle");

            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let data_dir = app_data_dir.join("data");
            std::fs::create_dir_all(&data_dir)?;

            let db_path = data_dir.join("app.db");
            if !db_path.exists() {
                std::fs::copy(server_dir.join("app.db.template"), &db_path)?;
            }

            let (mut rx, child) = handle
                .shell()
                .command(bun_path)
                .args(["run", "src/index.ts"])
                .current_dir(server_dir.clone())
                .env("DATABASE_URL", format!("file:{}", db_path.display()))
                .env("DATA_DIR", data_dir.display().to_string())
                .env("PORT", PORT.to_string())
                .env("CORS_ORIGIN", format!("http://localhost:{PORT}"))
                .env(
                    "FFMPEG_PATH",
                    "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg",
                )
                // Needed since transcription (audio duration), the editing
                // proxy and the logo/captions sizing all probe media -- a
                // bare "ffprobe" isn't on a GUI app's PATH, same as ffmpeg.
                .env(
                    "FFPROBE_PATH",
                    "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe",
                )
                .env(
                    "CLIENT_DIST_DIR",
                    server_dir.join("client-dist").display().to_string(),
                )
                .spawn()
                .map_err(|e| format!("failed to spawn bundled server process: {e}"))?;

            *handle.state::<ServerProcess>().0.lock().unwrap() = Some(child);

            // Drain stdout/stderr (so the child's pipes never fill up and
            // block it) and watch for the "server listening" line the
            // server logs on startup (see server/src/index.ts) -- once
            // seen, the server is ready to accept requests, so reveal the
            // window that was created hidden (see tauri.conf.json) to
            // avoid a startup race against the window trying to load
            // http://localhost:3001 before anything is listening there.
            let handle2 = handle.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let line = String::from_utf8_lossy(&line);
                            log::info!("[server] {line}");
                            if line.contains("server listening") {
                                if let Some(w) = handle2.get_webview_window("main") {
                                    // The webview starts loading frontendDist
                                    // (http://localhost:PORT) as soon as it's
                                    // created -- almost certainly before the
                                    // server has finished starting, so that
                                    // first load fails and the window is left
                                    // showing a blank page. Just calling
                                    // show() here does NOT retry that load --
                                    // confirmed by testing the built .app,
                                    // not just curling the server directly
                                    // (which proves the server works but
                                    // says nothing about what the webview
                                    // itself rendered). Explicitly navigate
                                    // now that the server is actually up.
                                    if let Ok(url) = tauri::Url::parse(&format!("http://localhost:{PORT}")) {
                                        let _ = w.navigate(url);
                                    }
                                    let _ = w.show();
                                }
                            }
                        }
                        CommandEvent::Stderr(line) => {
                            log::error!("[server] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Error(err) => {
                            log::error!("[server] process error: {err}");
                        }
                        CommandEvent::Terminated(payload) => {
                            log::warn!("[server] process exited: {payload:?}");
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // On macOS, a normal Cmd+Q quit reaches RunEvent::Exit directly
            // without RunEvent::ExitRequested firing first -- kill the
            // spawned server here, not in an ExitRequested handler.
            if let RunEvent::Exit = event {
                if let Some(child) = app_handle.state::<ServerProcess>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
