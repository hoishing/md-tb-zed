use std::{fs, path::PathBuf};
use zed_extension_api::{self as zed, LanguageServerId, Worktree};

const SERVER: &[u8] = include_bytes!("../dist/server.cjs");
const SERVER_HASH: &str = include_str!("../dist/server.sha256");

struct MarkdownTableTools;

impl zed::Extension for MarkdownTableTools {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &LanguageServerId,
        _worktree: &Worktree,
    ) -> Result<zed::Command, String> {
        // Zed gives every extension a writable working directory.
        // A content-addressed name keeps already running servers intact on rebuild.
        let server_path: PathBuf = std::env::current_dir()
            .map_err(|error| format!("Cannot locate extension directory: {error}"))?
            .join(format!("markdown-table-tools-{}.cjs", SERVER_HASH.trim()));

        if !server_path.is_file() {
            fs::write(&server_path, SERVER)
                .map_err(|error| format!("Cannot unpack table language server: {error}"))?;
        }

        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![server_path.to_string_lossy().into_owned(), "--stdio".into()],
            env: Default::default(),
        })
    }
}

zed::register_extension!(MarkdownTableTools);
