import * as functions from "firebase-functions";
import * as graphqlExpress from "express-graphql";
import * as schema from "./schema";
import * as database from "./database";
import axios, { AxiosResponse } from "axios";
import { URLSearchParams, URL } from "url";
import * as data from "./data";
import * as jsonWebToken from "jsonwebtoken";
import * as html from "@narumincho/html";

const pathToDescriptionAndImageUrl = async (
  path: string
): Promise<{ title: string; description: string; imageUrl: URL }> => {
  return {
    title: "TEAMe",
    description: "デジタル練習ノート",
    imageUrl: new URL(data.appOrigin + "/assets/icon.png")
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
    if (request.hostname !== data.appHostName) {
      response.redirect(data.appOrigin);
    }
    const descriptionAndImageUrl = await pathToDescriptionAndImageUrl(
      request.path
    );

    response.setHeader("content-type", "text/html");
    response.send(
      html.toString({
        appName: "TEAMe デジタル練習ノート",
        pageName: descriptionAndImageUrl.title,
        iconPath: ["assets", "icon.png"],
        coverImageUrl: descriptionAndImageUrl.imageUrl,
        twitterCard: html.TwitterCard.SummaryCard,
        scriptUrlList: [new URL(data.appOrigin + "/main.js")],
        styleUrlList: [],
        description: descriptionAndImageUrl.description,
        themeColor: "#a7d86e",
        language: html.Language.Japanese,
        manifestPath: ["assets", "manifest.json"],
        url: new URL(data.appOrigin + request.url),
        javaScriptMustBeAvailable: true,
        style: `html {
          height: 100%;
      }

      body {
          display: grid;
          margin: 0;
          height: 100%;
      }`,
        body: [html.div({}, "TEAMeを読み込み中……")]
      })
    );
  });

/* =====================================================================
 *                          API (GraphQL)
 *     https://us-central1-teame-c1a32.cloudfunctions.net/indexHtml
 * =====================================================================
 */

export const api = functions
  .runWith({ memory: "2GB" })
  .https.onRequest((request, response) => {
    const corsResult = supportCrossOriginResourceSharing(request, response);
    if (!corsResult.isNecessaryMainProcessing) {
      return;
    }

    graphqlExpress({
      schema: schema.schema(corsResult.origin),
      graphiql: true
    })(request, response);
  });

/* =====================================================================
 *              ソーシャルログインをしたあとのリダイレクト先
 *   https://us-central1-teame-c1a32.cloudfunctions.net/logInCallback
 * =====================================================================
 */
const createAccessTokenUrl = (
  path: string,
  origin: data.Origin,
  accessToken: string
): URL => {
  return data.urlWithFragment(
    origin,
    path,
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
      response.redirect(data.appOrigin);
      return;
    }
    const pathData = await database.checkExistsAndDeleteState(query.state);
    if (pathData === null) {
      response
        .status(400)
        .send(
          `LINE LogIn Error: TEAMe dose not generate state (${query.state})`
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
        createAccessTokenUrl(
          pathData.path,
          pathData.origin,
          accessToken
        ).toString()
      );
      return;
    }
    // ユーザーが存在したのでアクセストークンを再発行して返す
    response.redirect(
      createAccessTokenUrl(
        pathData.path,
        pathData.origin,
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
  const corsResult = supportCrossOriginResourceSharing(request, response);
  if (!corsResult.isNecessaryMainProcessing) {
    return;
  }
  if (request.method === "GET") {
    const pathList = request.path.split("/");
    response.setHeader("cache-control", "public, max-age=31536000");
    database
      .getReadableStream(schema.parseFileHash(pathList[pathList.length - 1]))
      .pipe(response);
    return;
  }
  response.status(400).send("invalid file parameter");
});

/**
 * CrossOriginResourceSharing の 処理をする
 */
const supportCrossOriginResourceSharing = (
  request: functions.https.Request,
  response: functions.Response
): { isNecessaryMainProcessing: boolean; origin: data.Origin } => {
  response.setHeader("vary", "Origin");
  const headerOrigin = request.headers["origin"];
  if (typeof headerOrigin === "string") {
    const localHostPort = headerOrigin.match(/http:\/\/localhost:(\d+)/);
    if (localHostPort !== null) {
      const origin = data.debugOrigin(Number.parseInt(localHostPort[1], 10));
      response.setHeader("access-control-allow-origin", headerOrigin);
      if (request.method === "OPTIONS") {
        response.setHeader(
          "access-control-allow-methods",
          "POST, GET, OPTIONS"
        );
        response.setHeader("access-control-allow-headers", "content-type");
        response.status(200).send("");
        return {
          origin,
          isNecessaryMainProcessing: false
        };
      }
      return {
        origin,
        isNecessaryMainProcessing: true
      };
    }
  }
  response.setHeader("access-control-allow-origin", data.appOrigin);
  response.setHeader("vary", "Origin");
  if (request.method === "OPTIONS") {
    response.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    response.status(200).send("");
    return {
      origin: data.releaseOrigin,
      isNecessaryMainProcessing: false
    };
  }
  return {
    origin: data.releaseOrigin,
    isNecessaryMainProcessing: true
  };
};
