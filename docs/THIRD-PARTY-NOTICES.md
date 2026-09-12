# 第三方元件與整合聲明

本專案自身程式依根目錄 LICENSE 採 MIT 授權；第三方元件仍依其原授權，不因本專案採 MIT 而改變。

## 隨安裝包附帶：Bootstrap 5.3.8 CSS

- 來源：https://getbootstrap.com/ ／ https://github.com/twbs/bootstrap
- 作者與著作權：Copyright (c) 2011–2025 The Bootstrap Authors。
- 授權：MIT。
- 使用檔案：vendor/bootstrap.min.css；用途為管理頁樣式。
- 完整授權保留於 [vendor/BOOTSTRAP-LICENSE.txt](../vendor/BOOTSTRAP-LICENSE.txt)，CSS 原始版權標頭亦保留。
- Bootstrap 未背書或贊助本插件。再散布時請一併保留原授權與版權聲明。

## 執行環境與整合對象（不隨包散布其程式）

- **OneComme／わんコメ**：本插件使用其插件介面接收留言、服務與直播資訊；相容模板模式會從使用者已安裝的 OneComme 載入 OneSDK。本包不含 OneComme 或 OneSDK 副本。使用者需另外依官方條款安裝使用：https://onecomme.com/ 。YT Rank Show 是獨立第三方插件，並非 OneComme 官方產品。
- **OBS Studio**：使用瀏覽器來源讀取本機榜單；本包不含 OBS。官方：https://obsproject.com/ 。
- **YouTube**：本插件處理 OneComme 提供的 YouTube 支持事件；經同意時查詢公開頻道／影片資料。不是 YouTube 官方產品，不代表其背書。
- **Microsoft Windows**：使用系統提供的 Windows PowerShell、.NET Framework／Windows Forms 及 winsqlite3.dll；不隨本包散布上述系統元件。
- **Node.js**：使用執行環境內建模組；歷史資料讀取優先使用可用的 node:sqlite，Windows 相容路徑則呼叫系統 winsqlite3.dll。本包未附 Node.js 或 SQLite 二進位程式。

## 開發與測試工具（不隨 Windows 插件包安裝）

瀏覽器自動化檢查使用 Microsoft Playwright；GitHub 驗證工作流程引用 actions/checkout、actions/setup-node、actions/upload-artifact。這些工具由測試環境提供或工作流程下載，其程式不內嵌於 Windows 插件包。來源：https://playwright.dev/ 、https://github.com/actions 。

## 使用者素材

使用者自行選擇的字型、背景圖片與內容不屬於本專案授權範圍，也不包含在乾淨安裝包。匯出／分享外觀、字型或圖片時，需自行確認各素材的使用與再散布權利。
