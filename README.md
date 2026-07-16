# game-verify

## 專案用途

`game-verify` 是 GanPlay 平台 Provably Fair（可證明公平性）玩家自助驗證的獨立**純靜態網站**，
以 **GitHub Pages**（project pages）發佈。玩家可透過本站自行核對各遊戲每一局的結果是否
可被驗證、未經竄改。

本站為純靜態、無後端、無 build step，直接由 GitHub Pages 服務。

## 檔案結構

```
/
├── index.html          站點入口頁
├── README.md           本說明文件
├── .nojekyll            關閉 GitHub Pages 的 Jekyll 處理
├── .gitignore           git 忽略清單
├── assets/
│   ├── css/
│   │   └── style.css   入口頁樣式
│   └── js/
│       └── main.js     入口頁腳本
└── games/                預留：未來各遊戲驗證頁的存放目錄（目前為空）
```

- `index.html`：站點入口頁，介紹本站用途並提供未來各遊戲驗證頁的導覽入口。
- `assets/`：靜態資源目錄，存放 CSS 與 JS。
- `games/`：預留給未來各遊戲的公平性驗證頁（例如各遊戲各自一個子目錄 / 頁面），
  本次骨架階段尚未放入任何內容。
- `.nojekyll`：GitHub Pages 預設會用 Jekyll 處理站台內容，本站不需要 Jekyll，
  放置此空檔可避免以 `_` 開頭的檔案 / 目錄被忽略。

## 本地預覽方式

本站為純靜態網站，不需安裝任何相依套件，可直接以瀏覽器開啟 `index.html` 預覽，
或於專案根目錄啟動簡易 HTTP server 後瀏覽：

```bash
python3 -m http.server
```

啟動後以瀏覽器開啟 `http://localhost:8000` 即可預覽。

## 範圍聲明

本 repo 目前僅提供**骨架**（入口頁與目錄結構），尚未實作任何遊戲的公平性驗證演算法
或驗證頁面。各遊戲的驗證頁為後續工作，將陸續加入 `games/` 目錄下。
