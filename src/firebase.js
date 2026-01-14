import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// ⚠️ 본인의 Firebase 설정 정보로 대체해야 합니다!
const firebaseConfig = {
  apiKey: "YOUR_API_KEY", 
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "...",
  appId: "...",
};

const app = initializeApp(firebaseConfig);

// DB 인스턴스만 미리 내보냅니다.
export const db = getFirestore(app);