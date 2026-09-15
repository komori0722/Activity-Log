# 継続力ダッシュボード

毎日の発信を無理なく続けるための、GitHub Pages向け静的Webアプリです。

## 使い方

1. `index.html` / `style.css` / `app.js` を同じGitHubリポジトリにアップロード
2. GitHubの **Settings → Pages**
3. **Deploy from a branch** を選択
4. `main` ブランチ / `/ (root)` を選択
5. Save
6. 表示されたURLを開く

データはブラウザの `localStorage` に保存されます。サーバーには送信しません。

## 注意

localStorage方式なので、別の端末・別のブラウザではデータは共有されません。
