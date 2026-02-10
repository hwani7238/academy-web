import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, writeBatch, doc } from "firebase/firestore";
import * as dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: '.env.local' });

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCaPZ-sA3wlcXZlEvWp-XURAPvD9oCcBqk", // Fallback to hardcoded for script if needed, but prefer env
    authDomain: "academy-website-7a3e1.firebaseapp.com",
    projectId: "academy-website-7a3e1",
    storageBucket: "academy-website-7a3e1.firebasestorage.app",
    messagingSenderId: "42014144740",
    appId: "1:42014144740:web:b7239f75ccad686f5e54f1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migratePiano() {
    console.log("Starting Piano Migration...");

    const variations = [
        "어린이 피아노",
        "어린이 피아노 취미",
        "성인 피아노",
        "성인 피아노 취미"
    ];

    const batch = writeBatch(db);
    let count = 0;

    for (const variant of variations) {
        const q = query(collection(db, "students"), where("instrument", "==", variant));
        const snapshot = await getDocs(q);
        console.log(`Found ${snapshot.size} students with '${variant}'`);

        snapshot.forEach((studentDoc) => {
            const ref = doc(db, "students", studentDoc.id);
            batch.update(ref, { instrument: "피아노" });
            count++;
        });
    }

    if (count > 0) {
        await batch.commit();
        console.log(`Successfully updated ${count} students to '피아노'.`);
    } else {
        console.log("No students needed updating.");
    }
}

migratePiano().catch(console.error);
