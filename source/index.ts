import * as functions from "firebase-functions";

export const indexHtml = functions
  .region("us-central1")
  .https.onRequest(async (request, response) => {
    if (request.hostname !== "teame-c1a32.web.app") {
      response.redirect("https://teame-c1a32.web.app");
    }
    const descriptionAndImageUrl = await pathToDescriptionAndImageUrl(
      request.path
    );

    response.setHeader("content-type", "text/html");
    response.send(`<!doctype html>
<html lang="ja">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <meta name="description" content="TEAMe デジタル練習ノート">
    <meta name="theme-color" content="#a7d86e">
    <title>TEAMe デジタル練習ノート</title>
    <link rel="icon" href="https://teame-c1a32.web.app/assets/icon.png">
    <link rel="manifest" href="https://teame-c1a32.web.app/manifest.json">
    <meta name="twitter:card" content="summary_large_image">
    <meta property="og:url" content="https://teame-c1a32.web.app${request.url}">
    <meta property="og:title" content="${escapeHtml(
      descriptionAndImageUrl.title
    )}">
    <meta property="og:site_name" content="TEAMe">
    <meta property="og:description" content="${escapeHtml(
      descriptionAndImageUrl.description
    )}">
    <meta property="og:image" content="${escapeHtml(
      descriptionAndImageUrl.imageUrl
    )}">
    <script src="https://teame-c1a32.web.app/main.js" defer></script>
    <style>
        html {
            height: 100%;
        }

        body {
            margin: 0;
            height: 100%;
        }
    </style>
</head>

<body>
    プログラムをダウンロード中……
    <noscript>
        TEAMeではJavaScriptを使用します。ブラウザの設定で有効にしてください。
    </noscript>
</body>
`);
  });

const pathToDescriptionAndImageUrl = async (
  path: string
): Promise<{ title: string; description: string; imageUrl: string }> => {
  return {
    title: "TEAMe",
    description: "デジタル練習ノート",
    imageUrl: "https://teame-c1a32.web.app/assets/icon.png"
  };
};

const escapeHtml = (text: string): string =>
  text.replace(/[&'`"<>]/g, (s: string): string =>
    s === "&"
      ? "&amp;"
      : s === "'"
      ? "&#x27;"
      : s === "`"
      ? "&#x60;"
      : s === '"'
      ? "&quot;"
      : s === "<"
      ? "&lt;"
      : s === ">"
      ? "&gt;"
      : ""
  );

export const sampleApi = functions
  .region("asia-northeast1")
  .https.onRequest((request, response) => {
    response.send("それな");
  });
