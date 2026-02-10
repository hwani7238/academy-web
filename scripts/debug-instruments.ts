import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import * as dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: '.env.local' });

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCaPZ-sA3wlcXZlEvWp-XURAPvD9oCcBqk",
    authDomain: "academy-website-7a3e1.firebaseapp.com",
    projectId: "academy-website-7a3e1",
    storageBucket: "academy-website-7a3e1.firebasestorage.app",
    messagingSenderId: "42014144740",
    appId: "1:42014144740:web:b7239f75ccad686f5e54f1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function listInstruments() {
    console.log("Listing all instruments in DB...");
    const studentsRef = collection(db, "students");
    const snapshot = await getDocs(studentsRef);

    const instruments = new Set();
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.instrument) {
            instruments.add(data.instrument);
        }
    });

    console.log("Unique Instruments found:");
    instruments.forEach(inst => console.log(`- '${inst}'`));
}

listInstruments().catch(console.error);
