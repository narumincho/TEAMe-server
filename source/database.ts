import * as crypto from "crypto";
import * as typedFirestore from "typed-admin-firestore";
import * as admin from "firebase-admin";

const app = admin.initializeApp();

const dataBase = (app.firestore() as unknown) as typedFirestore.Firestore<{
  lineLogInState: {
    key: string;
    value: { createdAt: admin.firestore.Timestamp };
    subCollections: {};
  };
}>;

const createRandomId = (): string => {
  return crypto.randomBytes(16).toString("hex");
};

export const generateAndWriteLogInState = async (): Promise<string> => {
  const state = createRandomId();
  await dataBase
    .collection("lineLogInState")
    .doc(state)
    .create({ createdAt: admin.firestore.Timestamp.fromDate(new Date()) });
  return state;
};
