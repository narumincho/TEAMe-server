import * as crypto from "crypto";
import * as stream from "stream";
import * as typedFirestore from "typed-admin-firestore";
import * as admin from "firebase-admin";
import { AxiosResponse } from "axios";
import axios from "axios";
import { URL } from "url";
import * as data from "./data";

const app = admin.initializeApp();

const database = (app.firestore() as unknown) as typedFirestore.Firestore<{
  lineLogInState: {
    key: string;
    value: StateData;
    subCollections: {};
  };
  user: {
    key: UserId;
    value: UserData;
    subCollections: {};
  };
  team: {
    key: TeamId;
    value: TeamData;
    subCollections: {};
  };
  pdca: {
    key: PdcaId;
    value: PdcaData;
    subCollections: {};
  };
  cycle: {
    key: CycleId;
    value: CycleData;
    subCollections: {};
  };
}>;

type StateData = {
  path: string;
  origin: data.Origin;
  createdAt: admin.firestore.Timestamp;
};

const storageDefaultBucket = app.storage().bucket();

export type UserData = {
  name: string;
  lineUserId: LineUserId;
  imageFileHash: FileHash;
  lastIssuedAccessTokenHash: AccessTokenHash;
  createdAt: admin.firestore.Timestamp;
  role: UserRole | null;
  teamId: TeamId | null;
};

export type GraphQLUserData = {
  id: UserId;
  name: string;
  imageFileHash: FileHash;
  createdAt: Date;
  role: UserRole | null;
  team: GraphQLTeamData | null;
};

export type GraphQLUserDataLowCost = {
  id: UserId;
  name: string;
  createdAt: Date;
  imageFileHash: FileHash;
  role: UserRole | null;
  team: {
    id: TeamId;
  } | null;
};

export const roleValues = {
  manager: {
    description: "マネージャー"
  },
  player: {
    description: "選手"
  }
};

export type UserRole = keyof typeof roleValues;

export type TeamData = {
  name: string;
  createdAt: admin.firestore.Timestamp;
  managerId: UserId;
  playerIdList: Array<UserId>;
};

export type GraphQLTeamData = {
  id: TeamId;
  name: string;
  createdAt: Date;
  manager: GraphQLUserData;
  playerList: Array<GraphQLUserData>;
};

export type GraphQLTeamDataLowCost = {
  id: TeamId;
  name: string;
  createdAt: Date;
  manager: {
    id: UserId;
  };
  playerList: Array<{
    id: UserId;
  }>;
};

export type PdcaData = {
  name: string;
  createdAt: admin.firestore.Timestamp;
};

export type CycleData = {
  createdAt: admin.firestore.Timestamp;
  plan: PlanData;
  do: string;
  check: string;
  act: string;
  updateAt: admin.firestore.Timestamp;
};

export type PlanData = {
  [key in string]: Question;
};

export type Question =
  | {
      _: "singleLineText";
      value: string;
    }
  | {
      _: "multiLineText";
      value: string;
    }
  | {
      _: "choices";
      value: string;
    };

export type QuestionType =
  | {
      _: "singleLineText";
      minLength: number;
      maxLength: number;
    }
  | {
      _: "multiLineText";
      minLength: number;
      maxLength: number;
    }
  | {
      _: "choices";
      choice: ReadonlyArray<{
        id: string;
        label: string;
      }>;
      limitation: ChoiceLimitation;
    };

export type Question_ =
  | "singleLineText"
  | "multiLineText"
  | "choices"
  | "image";

export type ChoiceLabel = {};

export type ChoiceLimitation = {
  minCount: number;
};

export type UserId = string & { _userId: never };

export type TeamId = string & { _teamId: never };

export type PdcaId = string & { _pdcaId: never };

export type CycleId = string & { _cycle: never };

export type LineUserId = string & { _lineUserId: never };

export type FileHash = string & { _fileHash: never };

export type AccessToken = string & { _accessToken: never };

export type AccessTokenHash = string & { _accessTokenHash: never };

/**
 * ランダムなIDを生成する
 */
const createRandomId = (): string => {
  return crypto.randomBytes(16).toString("hex");
};

/**
 * ソーシャルログイン stateを保存する
 */
export const generateAndWriteLogInState = async (
  path: string,
  origin: data.Origin
): Promise<string> => {
  const state = createRandomId();
  await database
    .collection("lineLogInState")
    .doc(state)
    .create({
      path: path,
      origin: origin,
      createdAt: admin.firestore.Timestamp.fromDate(new Date())
    });
  return state;
};

/**
 * ソーシャルログイン stateが存在することを確認し、存在するなら削除する
 */
export const checkExistsAndDeleteState = async (
  state: string
): Promise<{ path: string; origin: data.Origin } | null> => {
  const docRef = database.collection("lineLogInState").doc(state);
  const data = (await docRef.get()).data();
  if (data !== undefined) {
    await docRef.delete();
    return {
      path: data.path,
      origin: data.origin
    };
  }
  return null;
};

/**
 * LINEのUserIDからユーザーを探す
 * @param lineUserId
 */
export const getUserFromLineAccountId = async (
  lineUserId: LineUserId
): Promise<{ id: UserId; data: UserData } | null> => {
  const querySnapShot = await database
    .collection("user")
    .where("lineUserId", "==", lineUserId)
    .get();
  if (querySnapShot.docs.length === 0) {
    return null;
  }

  const queryDocumentSnapshot = querySnapShot.docs[0];
  return {
    id: queryDocumentSnapshot.id as UserId,
    data: queryDocumentSnapshot.data()
  };
};

export const getUserByAccessToken = async (
  accessToken: AccessToken
): Promise<GraphQLUserDataLowCost> => {
  const querySnapshot = await database
    .collection("user")
    .where("lastIssuedAccessTokenHash", "==", hashAccessToken(accessToken))
    .get();
  if (querySnapshot.docs.length === 0) {
    throw new Error(`accessToken is old or, invalid.`);
  }
  const documentValue = querySnapshot.docs[0];
  const data = documentValue.data();
  return {
    id: documentValue.id,
    name: data.name,
    createdAt: data.createdAt.toDate(),
    imageFileHash: data.imageFileHash,
    role: data.role,
    team:
      data.teamId === null
        ? null
        : {
            id: data.teamId
          }
  };
};

export const createHashFromBuffer = (
  data: Buffer,
  mimeType: string
): FileHash =>
  crypto
    .createHash("sha256")
    .update(data)
    .update(mimeType, "utf8")
    .digest("hex") as FileHash;

/**
 * アクセストークンを生成する
 */
const createAccessToken = (): AccessToken => {
  return crypto.randomBytes(24).toString("hex") as AccessToken;
};

const accessTokenToTypedArray = (accessToken: AccessToken): Uint8Array => {
  const binary = new Uint8Array(24);
  for (let i = 0; i < 24; i++) {
    binary[i] = Number.parseInt(accessToken.slice(i, i + 2), 16);
  }
  return binary;
};

/**
 * アクセストークンのハッシュ値を生成する
 * @param accessToken
 */
export const hashAccessToken = (accessToken: AccessToken): AccessTokenHash =>
  crypto
    .createHash("sha256")
    .update(accessTokenToTypedArray(accessToken))
    .digest("hex") as AccessTokenHash;

/**
 * Firebase Cloud Storage にファイルを保存する
 * @returns ハッシュ値
 */
const saveFile = async (
  buffer: Buffer,
  mimeType: string
): Promise<FileHash> => {
  const hash = createHashFromBuffer(buffer, mimeType);
  const file = storageDefaultBucket.file(hash);
  await file.save(buffer, { contentType: mimeType });
  return hash;
};

/**
 * 画像をURLからFirebase Cloud Storageに保存する
 * @param url 画像を配信しているURL
 */
const saveUserImageFromUrl = async (url: URL): Promise<FileHash> => {
  const response: AxiosResponse<Buffer> = await axios.get(url.toString(), {
    responseType: "arraybuffer"
  });
  const mimeType: string = response.headers["content-type"];
  return await saveFile(response.data, mimeType);
};

/**
 * 新たにユーザーを作成する
 * @param name ユーザー名
 * @param imageUrl ユーザーの画像を取得できるURL
 */
export const createUser = async (
  name: string,
  imageUrl: URL,
  lineUserId: LineUserId
): Promise<AccessToken> => {
  const userId = createRandomId() as UserId;
  const imageFileHash = await saveUserImageFromUrl(imageUrl);
  const accessToken = createAccessToken();
  await database
    .collection("user")
    .doc(userId)
    .create({
      name: name,
      createdAt: admin.firestore.Timestamp.now(),
      imageFileHash: imageFileHash,
      lastIssuedAccessTokenHash: hashAccessToken(accessToken),
      lineUserId: lineUserId,
      role: null,
      teamId: null
    });
  return accessToken;
};

/**
 * ユーザーのアクセストークンを更新する
 */
export const updateAccessToken = async (
  userId: UserId
): Promise<AccessToken> => {
  const newAccessToken = createAccessToken();
  await database
    .collection("user")
    .doc(userId)
    .update({
      lastIssuedAccessTokenHash: hashAccessToken(newAccessToken)
    });
  return newAccessToken;
};

const setUserRoleAndTeamId = async (
  userId: UserId,
  role: UserRole,
  teamId: TeamId
): Promise<void> => {
  await database
    .collection("user")
    .doc(userId)
    .update({
      role: role,
      teamId: teamId
    });
};

/**
 * Firebase Cloud Storageからファイルを読み込むReadable Streamを取得する
 * @param fileHash ファイルハッシュ
 */
export const getReadableStream = (fileHash: FileHash): stream.Readable => {
  return storageDefaultBucket.file(fileHash).createReadStream();
};

export const getUserData = async (
  userId: UserId
): Promise<GraphQLUserDataLowCost> => {
  const documentValue = (
    await database
      .collection("user")
      .doc(userId)
      .get()
  ).data();
  if (documentValue === undefined) {
    throw new Error(`user (${userId}) dose not exist`);
  }
  return {
    id: userId,
    name: documentValue.name,
    imageFileHash: documentValue.imageFileHash,
    role: documentValue.role,
    createdAt: documentValue.createdAt.toDate(),
    team:
      documentValue.teamId === null
        ? null
        : {
            id: documentValue.teamId
          }
  };
};

const createTeam = async (
  teamName: string,
  managerUserId: UserId
): Promise<GraphQLTeamDataLowCost> => {
  const teamId = createRandomId() as TeamId;
  const nowTime = new Date();
  await database
    .collection("team")
    .doc(teamId)
    .create({
      name: teamName,
      createdAt: admin.firestore.Timestamp.fromDate(nowTime),
      managerId: managerUserId,
      playerIdList: []
    });
  return {
    id: teamId,
    name: teamName,
    createdAt: nowTime,
    manager: {
      id: managerUserId
    },
    playerList: []
  };
};

const joinTeam = async (
  teamId: TeamId,
  userId: UserId
): Promise<{ id: TeamId }> => {
  const result = await database
    .collection("team")
    .doc(teamId)
    .update({
      playerIdList: admin.firestore.FieldValue.arrayUnion(userId)
    });
  return {
    id: teamId
  };
};

const teamDataToGraphQLTeamLowCost = (
  teamId: TeamId,
  teamData: TeamData
): GraphQLTeamDataLowCost => ({
  id: teamId,
  name: teamData.name,
  manager: {
    id: teamData.managerId
  },
  playerList: teamData.playerIdList.map(playerId => ({ id: playerId })),
  createdAt: teamData.createdAt.toDate()
});

export const getAllTeam = async (): Promise<Array<GraphQLTeamDataLowCost>> => {
  const docs: Array<typedFirestore.QueryDocumentSnapshot<TeamId, TeamData>> = (
    await database.collection("team").get()
  ).docs;
  return docs.map<GraphQLTeamDataLowCost>(doc =>
    teamDataToGraphQLTeamLowCost(doc.id, doc.data())
  );
};

export const getTeamData = async (
  teamId: TeamId
): Promise<GraphQLTeamDataLowCost> => {
  const documentValue = (
    await database
      .collection("team")
      .doc(teamId)
      .get()
  ).data();
  if (documentValue === undefined) {
    throw new Error(`team (${teamId}) dose not exist`);
  }
  return teamDataToGraphQLTeamLowCost(teamId, documentValue);
};

export const createTeamAndSetManagerRole = async (
  accessToken: AccessToken,
  teamName: string
): Promise<GraphQLUserDataLowCost> => {
  const userData = await getUserByAccessToken(accessToken);
  const teamData = await createTeam(teamName, userData.id);
  await setUserRoleAndTeamId(userData.id, "manager", teamData.id);
  return userData;
};

export const joinTeamAndSetPlayerRole = async (
  accessToken: AccessToken,
  teamId: TeamId
): Promise<{ id: TeamId }> => {
  const userData = await getUserByAccessToken(accessToken);
  await joinTeam(teamId, userData.id);
  return {
    id: teamId
  };
};
