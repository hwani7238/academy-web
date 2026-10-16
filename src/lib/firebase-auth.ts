import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyCaPZ-sA3wlcXZlEvWp-XURAPvD9oCcBqk",
    authDomain: "academy-website-7a3e1.firebaseapp.com",
    projectId: "academy-website-7a3e1",
    storageBucket: "academy-website-7a3e1.firebasestorage.app",
    messagingSenderId: "42014144740",
    appId: "1:42014144740:web:b7239f75ccad686f5e54f1"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export { firebaseConfig };
