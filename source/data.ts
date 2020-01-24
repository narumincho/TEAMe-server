import { URL, URLSearchParams } from "url";
import * as functions from "firebase-functions";

export const urlFromString = (domainAndPath: string): URL =>
  new URL("https://" + domainAndPath);

export const urlFromStringWithQuery = (
  domainAndPath: string,
  query: Map<string, string>
): URL => {
  const url = new URL("https://" + domainAndPath);
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

export const appSchemeAndHostName = "https://" + appHostName;

export const lineLogInRedirectUri =
  "https://us-central1-teame-c1a32.cloudfunctions.net/logInCallback";

export const lineLogInClientId = "1653666716";

export const lineLogInChannelSecret: string = functions.config()["line-log-in"][
  "channel-secret"
];

export type Origin = { _: "app" } | { _: "debug"; port: number };

export const appOrigin: Origin = { _: "app" };

export const debugOrigin = (portNumber: number): Origin => ({
  _: "debug",
  port: portNumber
});

export const originToString = (origin: Origin): string => {
  switch (origin._) {
    case "app":
      return "https://" + appHostName;
    case "debug":
      return "http://localhost:" + origin.port.toString();
  }
};
