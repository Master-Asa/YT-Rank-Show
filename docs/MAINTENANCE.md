# 維護與發布

## 版本與發行

只修改 VERSION，然後執行 `node scripts/sync-version.js`。app-version.js、package.json 版本、管理頁與安裝文件標籤由它同步，不要分別手改。

`node scripts/package.js` 先檢查版本、白名單、私人路徑／憑證、入口資源與全部 JavaScript 語法，再連續跑三輪測試。任一輪失敗即停止，不把重跑成功當作先前沒有失敗。成功後才產生 dist/release-*，包含 Windows ZIP、Source ZIP、SHA256SUMS.txt 與 VALIDATION.json。開發診斷可用 YT_TEST_ROUNDS=1，正式發布使用預設三輪。

GitHub 工作流程使用 Windows／Node 24，只有 contents:read 權限。手動觸發可保留乾淨 ZIP 為工作流程產物；不建立公開 Release、不更改儲存庫可見性、不推送提交。雲端測試只使用合成資料，不得上傳日用紀錄、個人字型或背景。

正式發布需確認檢查通過，再把已驗證 Windows ZIP、檢查碼與安裝說明附在預發行 Release；不可把包含備份和舊產物的開發目錄整包推送。

安裝可使用 `scripts/install-local.ps1 -InstallerPath <解壓後 installer 路徑>`，確認 OneComme 關閉、核對檔案並備份既有插件／資料後，只替換發行清單內程式。不會自動啟動 OneComme 或刪除紀錄。若 PowerShell 政策不允許執行，照 INSTALL.md 手動安裝，不需放寬系統政策。

## 程式分工

- channel-lock.js：歸屬、移出狀態與影片資訊的共用規則；前後端一致使用。
- session-manager.js：已加入／未加入場次、搜尋、移出／重新加入與查詢介面。
- channel-admin.js：鎖定頻道與貼網址手動確認；舊重複歸屬表格已移除。
- src/runtime.js：序列化存檔、備份、即時收錄與場次異動；網路查詢不佔用收錄佇列。

## 乾淨包檔案原則

Windows 安裝包僅包含 release-files.json 的 install 白名單；tests、開發腳本與 CI 只在原始碼包。data、output、backups、implementation、mockup、node_modules、舊 ZIP、私人字型和背景不入包。

release-check 檢查重複清單項目、靜態相對 require 依賴、HTML 資源、版號、私人路徑與授權檔，再跑三輪測試。ZIP 另附逐檔雜湊。根目錄「先看我」與插件內 docs/INSTALL.md 為刻意保留的同內容入口：前者供尚未安裝者，後者供已安裝者離線查閱。

obs-sc.html、obs-gift.html、obs-output.js 保留舊來源網址相容，不能因表面相似就刪除；多份 CSS 分別負責基礎、工作區、創作者版面與展開提示，動態 class 與舊模式尚需使用，不在此版做高風險裁切。Bootstrap 的版權標頭與獨立授權檔都必須保留。

- creator-ui.js：草稿、保存、九榜選擇與模組協調。
- studio-template.js：靜態介面，不插入使用者 HTML。
- studio-canvas.js：背景尺寸、縮放與超出画布提示。
- studio-emoji.js：前三名符號欄位與互動。
- studio-font-preview.js：目前榜單字型檢查與預覽。
- font-picker.js／font-face-cache.js：搜尋與可淘汰的預覽快取。
- style-theme.js／style-store.js：外觀規範、CSS、保存與跨榜複製。

## 量測與剩餘限制

v0.8.0 乾淨清單核對：沒有逐位元完全相同的重複程式檔；最大檔案為 Bootstrap CSS（約 232 KB，未壓縮）。保留原廠 CSS 與授權，未用靜態 class 掃描盲目裁切動態介面。歸屬判斷不再逐事件複製整份影片目錄；CSV 匯出只整理一次歸屬設定。1 萬筆單次合成快照對照為 79 ms／77 ms，差距不足以宣稱顯著加速；此處主要避免新增快取帶來擴大成本。

`node scripts/benchmark.js 10000` 或 `100000` 使用合成紀錄，不讀 AppData。量測包含排行榜快照與 100 筆批次收錄，不含完整存檔或 OneComme 收訊，不能視為端到端速度。

2026-09-12 同環境量測：1 萬筆快照 414→79 ms、批次收錄 137→4 ms；10 萬筆快照 4484→628 ms、批次收錄 1734→64 ms。硬體和資料不同會影響結果。10 萬筆兩版 RSS 均約 162 MiB，不能宣稱整體記憶體已下降。

仍載入完整歷史；首次開管理頁、錯過多次版本與大批匯入可能完整傳送。增量傳送不是伺服器分頁；資料變動後仍重算排行，只是降低格式器和收錄成本。SQLite、完整分頁與增量聚合留待端到端壓測及需求決定，本次不改儲存格式。

字型快取 64 MiB 是檔案大小估算，不是瀏覽器記憶體上限。當前字型受保護時可能暫時超過（最多 8 個名稱，每名稱只保留最新字面）；已保存字型仍另受 64 MiB 上限。切換榜單後不再受保護的舊字面會被淘汰。

工作流程依照 GitHub 官方 [checkout](https://github.com/actions/checkout)、[setup-node](https://github.com/actions/setup-node)、[upload-artifact](https://github.com/actions/upload-artifact) 文件建立。尚未推送前，本機檢查不等於 GitHub 雲端工作流程已執行。
