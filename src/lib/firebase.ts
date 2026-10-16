import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { app } from "./firebase-auth";
export { auth, firebaseConfig } from "./firebase-auth";
export const db = getFirestore(app);
export const storage = getStorage(app);
