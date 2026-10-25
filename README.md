# Markdown Table Tools for Zed

在 Markdown 表格內按 **`Cmd+.`**，即可選擇新增／刪除列與欄。
也可以按 `Cmd+Shift+P`，執行 `editor: toggle code actions`，再選取操作。

## 六項操作

| Code Action | 功能 |
| --- | --- |
| `Table: Remove Row` | 刪除目前資料列 |
| `Table: Remove Column` | 刪除目前欄 |
| `Table: Add Column Left` | 在目前欄左側新增空白欄 |
| `Table: Add Column Right` | 在目前欄右側新增空白欄 |
| `Table: Add Row Above` | 在目前資料列上方新增空白列 |
| `Table: Add Row Below` | 在目前列下方新增空白列 |

游標須位於 Markdown 原始碼的表格內，而且不能選取一段文字。
欄操作會同步修改表頭、分隔列與所有資料列。操作可使用 Zed 的 Undo 復原。

### 結構保護

- 不提供刪除表頭列、刪除最後一欄、在表頭上方新增列的操作。
- 在表頭執行「Add Row Below」，會在分隔列下方新增第一筆資料。
- 在分隔列上僅提供有效的欄操作。
- 刪除最後一筆資料後，保留表頭與分隔列。
- 不會對程式碼區塊中的表格文字提供操作。
- 支援引用區塊、清單內的表格、跳脫的 `\|`、中文、emoji 與 CRLF。
- 欄位不足的資料列，在欄操作時補上空白儲存格。
- 如果資料列包含超出表頭欄數的儲存格，整張表格不提供操作，避免遺失 Markdown 渲染器通常忽略的內容。

一般 Zed 外掛無法將這六項操作直接註冊為命令面板的獨立命令，也無法直接加入右鍵選單。右鍵的 **Show Code Actions** 可開啟同一份操作清單。

## 安裝本機開發版

需求：Zed 1.25.3 或更新版本，以及透過 rustup 安裝的 Rust。

```sh
# 載入目前 shell 的 Rust 路徑：
. "$HOME/.cargo/env"

rustup target add wasm32-wasip2
```

1. 在 Zed 命令面板執行 `zed: install dev extension`。
2. 選取包含 `extension.toml` 的專案根目錄（`md-tb-zed`），不要選 `dist`。
3. 等候編譯完成，開啟 `.md` 文件，將游標放入表格後按 `Cmd+.`。

若 Zed 回報 `running rustc: No such file or directory`，代表 Zed 的 `PATH` 找不到 Rust；即使終端能執行 `cargo`，仍可能發生。在 macOS 使用預設 zsh 時，請將以下內容加入 `~/.zprofile`，讓登入 shell 載入 Rust 路徑：

```sh
if [ -f "$HOME/.cargo/env" ]; then
    . "$HOME/.cargo/env"
fi
```

接著以 `Cmd+Q` 完整退出所有 Zed 視窗，再重新開啟並安裝。只關閉視窗或執行 Rebuild 不會更新既有 Zed 程序的環境。也可在完整退出後，從已執行 `. "$HOME/.cargo/env"` 的終端執行 `zed .`。

`dist/server.cjs` 是已打包、內嵌於外掛的語言伺服器。安裝及使用外掛不需要執行 `npm install`；Node.js 由 Zed 管理。

如果你的 Zed 設定明確指定 Markdown 使用哪些語言伺服器，請將此外掛加入原有清單：

```json
{
  "languages": {
    "Markdown": {
      "language_servers": ["markdown-table-tools", "..."]
    }
  }
}
```

若仍無操作清單，請確認 Markdown 的 `enable_language_server` 沒有設為 `false`，並透過 `zed: open log` 檢查啟動錯誤。

## 修改與建置

開發 JavaScript 部分需要 Node.js 20 或更新版本與 npm。

```sh
npm ci
npm run check
npm run build:extension
```

`npm run check` 只檢查 JavaScript 語法。專案沒有加入測試程式。

建置產物：

- `dist/server.cjs`、`dist/server.sha256`：隨專案保留，讓 Zed 可直接編譯開發外掛。
- `target/wasm32-wasip2/release/markdown_table_tools.wasm`：Rust 外掛建置產物。

修改伺服器後須先重新執行 `npm run build`，再於 Zed 擴充套件頁按 **Rebuild**。只重新編譯 Rust 不會更新 JavaScript bundle。

## 實作

Rust 外掛透過 `zed_extension_api` 取得 Node.js 路徑，將內嵌的伺服器解出至 Zed 的外掛工作目錄並啟動。伺服器透過 stdio 使用 LSP，依未儲存的最新文件內容計算操作，並傳回包含文件版本的 `WorkspaceEdit`。

表格使用 micromark／mdast 的 GFM table 擴充解析；編輯依原始位置進行，保留儲存格文字與既有欄對齊，不格式化其他文件內容。新增的欄預設無對齊設定。
