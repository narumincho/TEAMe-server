import { URL, URLSearchParams } from "url";
import * as functions from "firebase-functions";

export const urlFromString = (domainAndPath: string): URL =>
  new URL("https://" + domainAndPath);

export const urlFromStringWithQuery = (
  domain: string,
  path: ReadonlyArray<string>,
  query: Map<string, string>
): URL => {
  const url = new URL("https://" + domain + path.join("/"));
  for (const [key, value] of query) {
    url.searchParams.append(key, value);
  }
  return url;
};

/**
 * フラグメント (#から始まるサーバーに送らないデータ)を?クエリのようにキーと値の組のデータとしてURLを構成する
 * @param origin
 * @param path /data など
 * @param fragment URLSearchParamsとしてエンコードされる
 */
export const urlFromStringWithFragment = (
  origin: Origin,
  path: string,
  fragment: Map<string, string>
): URL => {
  const url = new URL(originToString(origin) + path);
  url.hash = new URLSearchParams(fragment).toString();
  return url;
};

export const appHostName = "teame-c1a32.web.app";

export const appOrigin = "https://" + appHostName;

export const lineLogInRedirectUri =
  "https://us-central1-teame-c1a32.cloudfunctions.net/logInCallback";

export const lineLogInClientId = "1653666716";

export const lineLogInChannelSecret: string = functions.config()["line-log-in"][
  "channel-secret"
];

export type Origin =
  | { _: Origin_.Release }
  | { _: Origin_.Debug; port: number };

const enum Origin_ {
  Release,
  Debug
}

export const releaseOrigin: Origin = { _: Origin_.Release };

export const debugOrigin = (portNumber: number): Origin => ({
  _: Origin_.Debug,
  port: portNumber
});

export const originToString = (origin: Origin): string => {
  switch (origin._) {
    case Origin_.Release:
      return appOrigin;
    case Origin_.Debug:
      return "http://localhost:" + origin.port.toString();
  }
};
