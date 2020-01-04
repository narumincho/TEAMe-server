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
 *
 * @param hostNameAndPath https:// を除いたホスト名とパス narumincho.com/path など
 * @param fragment URLSearchParamsとしてエンコードされる
 */
export const urlFromStringWithFragment = (
  hostNameAndPath: string,
  fragment: Map<string, string>
): URL => {
  const url = new URL("https://" + hostNameAndPath);
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
