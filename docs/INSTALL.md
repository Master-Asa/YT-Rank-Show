<!-- Release 0.9.2 -->
# YT Rank Show — 安裝與升級

## 適用環境與支援範圍

管理頁預設使用深色配色。右上角「管理頁配色」可改為淺色或跟隨系統，瀏覽器會記住選擇；此設定不影響 OBS 外觀。支持紀錄可篩選待核對；場次管理可依紀錄年份／月份、狀態搜尋，每頁 20 場，點選一場才顯示資訊與加入／移出操作。

本插件目前為測試版；「OneComme 能啟動」不代表此插件所有功能皆已驗證。以下為本插件的驗證範圍，不代表 OneComme 官方的完整支援清單。

| 項目 | 建議／驗證範圍 |
|---|---|
| 作業系統 | 主要驗證：Windows 11 64 位元桌面環境；目前驗證機為 25H2（Build 26200）。 |
| OneComme | 主要驗證：Windows 版 9.1.1。其他版本未完整驗證，升級後請先測試收錄、確認視窗及 OBS。 |
| 管理頁 | 優先從 OneComme 擴充功能提供的網址開啟。自動化操作檢查使用 Microsoft Edge；其他瀏覽器未完整驗證。 |
| OBS | Windows 版 OBS Studio，必須含「瀏覽器」來源。本專案尚未建立 OBS 最低版本保證；請勿把瀏覽器模擬測試視為所有 OBS 版本已實測。 |
| 直播平台 | YouTube 的 SC／Super Sticker、贈送會員與寶石；只統計 OneComme 實際提供且通過歸屬及紀錄規則的事件。 |
| 顯示空間 | 建議管理頁可用區域約 1280 × 900 或以上；較窄視窗使用響應式排版。系統縮放、字型及 emoji 外觀可能有差異。 |
| 必要元件 | Windows PowerShell 5.1、.NET Framework 的 Windows Forms，及可讀寫的本機使用者資料夾。一般使用者不需另外安裝 Node.js。 |
| 本機連線 | 管理頁與 OBS 需能存取本機服務（預設 11180／11181）；請勿將連接埠對外公開。 |

- Windows 10 64 位元：具有相關系統元件，但本插件未完成獨立端到端驗證，不列為主要支援環境。
- Windows XP／Vista／7／8／8.1、32 位元 Windows：不支援。
- macOS、Linux、Windows ARM、Windows Server、Wine／相容層、無互動桌面或精簡／修改版 Windows：不在目前發行包支援範圍內。
- 不提供獨立 CPU／RAM 最低需求保證；需同時滿足 OneComme 與 OBS 自身需求，並為直播及紀錄量預留資源。
- 查詢公開頻道／影片資料需要網路及使用者同意；查詢可能因 DNS、網路限制、影片權限或 YouTube 頁面變動而失敗。這不等於本機紀錄消失。

### 確認小視窗的限制

插件透過系統 Windows PowerShell（powershell.exe）載入 Windows Forms，在目前登入的桌面顯示確認視窗；不是瀏覽器通知，也不依賴 Windows 通知中心。Windows PowerShell 與 PowerShell 7 並非同一套程式，只安裝 PowerShell 7 不能替代此元件。

即使在 Windows 11，企業群組原則、應用程式控管、防毒、元件缺失或非互動桌面，仍可能阻擋視窗。視窗開啟失敗／逾時不會自動判定為同意，也不會刪除原始紀錄；請在管理頁人工核對。只關閉視窗或選「稍後」，本次執行不再提示；選「否」會保存略過提示的狀態，仍可在管理頁手動加入。

不要為了顯示視窗而關閉防毒、停用組織政策或將整個系統改成允許任意腳本。受管理電腦應由管理員評估，或使用管理頁手動確認。

### 問題回報請提供

插件版本、Windows 版本與組建（winver）、64 位元／架構、OneComme 版本、OBS 版本（若涉及輸出）、重現步驟、錯誤文字及遮蔽個資的截圖。不要公開完整備份、OBS 私有網址或使用者資料。

參考：[OneComme 官方下載](https://onecomme.com/download/)、[Microsoft：Windows PowerShell 5.1](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_windows_powershell_5.1?view=powershell-5.1)、[Microsoft：Windows PowerShell 與 PowerShell 的差異](https://learn.microsoft.com/en-us/powershell/scripting/what-is-windows-powershell)。

## 第一次安裝（Windows）

1. 安裝並開啟 OneComme。本版開發驗證環境為 OneComme 9.1.1／Windows；其他版本尚未完整驗證。
2. 從 GitHub Releases 下載 YT-Rank-Show-版本-Windows.zip。不要把 GitHub 自動產生的 Source code ZIP 當安裝包。
3. 解壓縮。在 OneComme「擴充功能」視窗，按資料夾按鈕打開 plugins 目錄。
4. 將整個 local.yt-rank-show.plugin 資料夾放入。正確位置：plugins/local.yt-rank-show.plugin/plugin.js。不要多包一層，也不要只複製 plugin.js。
5. 回到擴充功能，重新載入並啟用 YT Rank Show。權限用於接收留言、連線與直播資訊，不要求登入密碼。
6. 開啟擴充功能提供的管理頁網址：http://localhost:11180/plugins/local.yt-rank-show.plugin/index.html
7. 設定要統計的頻道：貼上 @頻道網址，勾選同意後按「查詢頻道」，核對結果再確認儲存。只向 YouTube 查公開資料，不上傳紀錄；也可填 UC 開頭的 Channel ID 直接離線儲存。再確認直播歸屬。確認背景已啟用後，管理頁可以關閉。
8. 到「OBS 外觀與輸出」從九張卡片選擇榜單，按「設定與預覽」調整名稱、名次及外觀。儲存後從同一張卡片複製網址，貼到 OBS「瀏覽器來源」。網址包含私有讀取金鑰，不要公開分享。

只安裝一份擴充功能。不需要再放 templates/custom，不需要啟動解析器，不需要安裝 Node.js。字型和背景圖由使用者自行選擇，安裝包不含私人素材。

## 從舊版升級

v0.8.0 的「已移出統計」狀態為新功能。更舊版本不認識此狀態，降級可能自動重新加入場次；不要直接覆蓋降級，請先備份並核對降級後的場次及榜單。

1. 在目前管理頁先下載完整 JSON 備份，另外備份 %APPDATA%/YT-Rank-Show/data。複製資料夾時先停止插件，避免複製到一半仍在更新。
2. 停用 YT Rank Show 或正常關閉 OneComme，再替換 plugins 中此插件的程式檔。不要覆寫／刪除上述資料資料夾。
3. 重新載入並啟用。管理頁按 Ctrl+F5。v0.5.0 會先保留原 v3 state.json 備份，再轉為按月儲存 v4。
4. 若仍在使用舊模板，先在「原本的瀏覽器與原網址」重新整理原管理頁，完成舊資料移入；不要清除網站資料。核對紀錄、頻道、外觀後，才統一改用擴充功能入口。
5. 重新複製 OBS 網址，保留網址 # 後的完整內容。確認三榜正常後再停用舊模板；不要兩個入口同時修改設定。

## 資料與備份

- 實際資料：%APPDATA%/YT-Rank-Show/data。不是插件安裝目錄。
- state.json：目前索引。objects：各月份紀錄和外觀。state.previous.json：前一代索引。不要單獨刪除或搬走其中的檔案。
- before-storage-v4-*.json、before-migration-*.json：轉換／移入前保護備份，不自動清除。
- backups/*.json.gz：完整本機壓縮快照（包括金鑰），不是加密。可用支援 gzip 的解壓縮工具讀取。
- 「匯出與備份 → 資料空間與本機備份」可查看用量、建立本機快照、確認後只保留最新五份手動／會員修復快照。既有「完整 JSON 備份」用於下載到自己指定的位置；目前沒有一鍵還原介面。
- 歷史榜仍涵蓋所有月份；按月分檔不等於刪除。清空統計也不是空間清理。

## 必須還原時

先停用插件或關閉 OneComme，保留當前整個 data 的副本。可將建立於此版本的手動 json.gz 解壓成完整 JSON（必須含 schemaVersion:3、events、writeToken 等欄位），用其替換 data/state.json，再啟用；會重新轉換為 v4。若使用的是從管理頁下載的 format:yt-rank-show-backup JSON，不能直接改名當 state.json，請先尋求協助。要降級 v0.4.x，使用升級前 state.json 或完整 v3 本機快照，不能讓舊版直接讀 v4 索引。

## 常見問題

- 誤加直播：到「頻道與直播 → 直播場次管理 → 已加入統計」按「移出統計」。原始紀錄保留，OBS 與 TXT 重新計算；之後可在「未加入統計」重新加入，不重複新增事件。移出會保留本機阻擋自動加入的狀態。
- 場次沒有標題：可勾選同意後查詢公開影片資訊。結果保存在本機，不會自動加入統計；YouTube 標題可能和開台時不同。
- 第三方元件：本包含 Bootstrap CSS，保留原 MIT 授權。其他整合環境與素材責任請見 docs/THIRD-PARTY-NOTICES.md。

- TXT 文字檔的空格、空白行與名稱長度：到「OBS 外觀與輸出 → 純文字輸出（TXT）」。網頁榜單請在各榜的外觀編輯器調整，兩種輸出不必重複設定。

- 匯入過去紀錄：預覽會包含 OneComme 保存的其他頻道影片。先勾選同意並查詢影片資訊，核對所屬頻道；不符會阻擋，未知須逐場人工確認。查詢不等於匯入，也不會補抓 YouTube 留言。

- 背景未就緒：檢查擴充功能已啟用、11181 沒被其他程序佔用。不要同時啟動兩份插件或舊同步器。
- 畫面缺樣式：Ctrl+F5，確認完整資料夾已放好。
- 管理頁能開不代表正在直播收錄：OneComme 必須連到直播，且直播已確認屬於鎖定頻道。
- 不會自动補抓 YouTube 整月歷史，只記錄 OneComme 實際提供的事件。



### 減少每場手動確認

在「頻道與直播」複製固定頻道網址，貼到 OneComme 的連線網址。請等待 OneComme 接到該頻道的直播並發布資訊，插件才會自動确认。若使用影片網址或 @handle 而缺少歸屬資訊，請使用人工確認。升級後請重新載入管理頁；字型可重新「讀取本機字型」並選用，再「儲存並套用」。
