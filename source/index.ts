import * as functions from "firebase-functions";
import * as graphqlExpress from "express-graphql";
import * as schema from "./schema";
import * as database from "./database";
import axios, { AxiosResponse } from "axios";
import { URLSearchParams, URL } from "url";
import * as data from "./data";
import * as jsonWebToken from "jsonwebtoken";

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

const pathToDescriptionAndImageUrl = async (
  path: string
): Promise<{ title: string; description: string; imageUrl: string }> => {
  return {
    title: "TEAMe",
    description: "デジタル練習ノート",
    imageUrl: "https://teame-c1a32.web.app/assets/icon.png"
  };
};

/* =====================================================================
 *               Index Html ブラウザが最初にリクエストするところ
 *
 *          https://teame-c1a32.web.app/ など
 *              ↓ firebase.json rewrite
 *          Cloud Functions for Firebase / indexHtml
 * =====================================================================
 */

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
    <link rel="manifest" href="https://teame-c1a32.web.app/assets/manifest.json">
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

/* =====================================================================
 *                          API (GraphQL)
 *     https://us-central1-teame-c1a32.cloudfunctions.net/indexHtml
 * =====================================================================
 */

export const api = functions
  .runWith({ memory: "2GB" })
  .https.onRequest((request, response) => {
    console.log("API called");
    response.setHeader(
      "access-control-allow-origin",
      "https://teame-c1a32.web.app"
    );
    response.setHeader("vary", "Origin");
    if (request.method === "OPTIONS") {
      response.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
      response.setHeader("access-control-allow-headers", "content-type");
      response.status(200).send("");
      return;
    }
    graphqlExpress({ schema: schema.schema, graphiql: true })(
      request,
      response
    );
  });

/* =====================================================================
 *              ソーシャルログインをしたあとのリダイレクト先
 *   https://us-central1-teame-c1a32.cloudfunctions.net/logInCallback
 * =====================================================================
 */
const createAccessTokenUrl = (path: string, accessToken: string): URL => {
  return data.urlFromStringWithFragment(
    "teame-c1a32.web.app" + path,
    new Map([["accessToken", accessToken]])
  );
};

const verifyAccessTokenAndGetData = (
  idToken: string
): Promise<{
  iss: "https://access.line.me";
  sub: database.LineUserId;
  name: string;
  picture: URL;
}> =>
  new Promise((resolve, reject) => {
    jsonWebToken.verify(
      idToken,
      data.lineLogInChannelSecret,
      {
        algorithms: ["HS256"]
      },
      (error, decoded) => {
        if (error) {
          console.log("lineTokenの正当性チェックで正当でないと判断された!");
          reject("token invalid!");
          return;
        }
        const decodedData = decoded as {
          iss: unknown;
          sub: unknown;
          name: unknown;
          picture: unknown;
        };
        if (
          decodedData.iss !== "https://access.line.me" ||
          typeof decodedData.name !== "string" ||
          typeof decodedData.sub !== "string" ||
          typeof decodedData.picture !== "string"
        ) {
          console.log("lineのidTokenに含まれているデータの型が違かった");
          reject("token data is invalid!");
          return;
        }
        resolve({
          iss: decodedData.iss,
          name: decodedData.name,
          sub: decodedData.sub as database.LineUserId,
          picture: new URL(decodedData.picture)
        });
      }
    );
  });

export const logInCallback = functions
  .region("us-central1")
  .https.onRequest(async (request, response) => {
    const query: { code: unknown; state: unknown } = request.query;
    if (typeof query.code !== "string" || typeof query.state !== "string") {
      response.redirect("https://teame-c1a32.web.app");
      return;
    }
    const pathData = await database.checkExistsAndDeleteState(query.state);
    if (pathData === null) {
      response
        .status(400)
        .send(
          `LINE LogIn Error: Definy dose not generate state (${query.state})`
        );
      return;
    }
    // ここで https://api.line.me/oauth2/v2.1/token にqueryのcodeをつけて送信。IDトークンを取得する
    const idToken = ((await axios.post(
      "https://api.line.me/oauth2/v2.1/token",
      new URLSearchParams(
        new Map([
          ["grant_type", "authorization_code"],
          ["code", query.code],
          ["redirect_uri", data.lineLogInRedirectUri],
          ["client_id", data.lineLogInClientId],
          ["client_secret", data.lineLogInChannelSecret]
        ])
      ).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    )) as AxiosResponse<{ id_token: string }>).data.id_token;
    const lineData = await verifyAccessTokenAndGetData(idToken);
    const userData = await database.getUserFromLineAccountId(lineData.sub);
    // ユーザーが存在しなかったので新しく作る
    if (userData === null) {
      const accessToken = await database.createUser(
        lineData.name,
        lineData.picture,
        lineData.sub
      );
      response.redirect(
        createAccessTokenUrl(pathData.path, accessToken).toString()
      );
      return;
    }
    // ユーザーが存在したのでアクセストークンを再発行して返す
    response.redirect(
      createAccessTokenUrl(
        pathData.path,
        await database.updateAccessToken(userData.id)
      ).toString()
    );
  });

/* =====================================================================
 *                 File バイナリファイルを欲しいときに利用する
 *      https://us-central1-teame-c1a32.cloudfunctions.net/file
 * =====================================================================
 */
export const file = functions.https.onRequest(async (request, response) => {
  response.setHeader(
    "access-control-allow-origin",
    "https://definy-lang.web.app/"
  );
  response.setHeader("vary", "Origin");
  if (request.method === "OPTIONS") {
    response.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    response.status(200).send("");
    return;
  }
  if (request.method === "GET") {
    response.setHeader("cache-control", "public, max-age=31536000");
    database
      .getReadableStream(schema.parseFileHash(request.path.slice(1)))
      .pipe(response);
    return;
  }
  response.status(400).send("invalid file parameter");
});
