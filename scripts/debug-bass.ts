import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCaPZ-sA3wlcXZlEvWp-XURAPvD9oCcBqk",
    authDomain: "academy-website-7a3e1.firebaseapp.com",
    projectId: "academy-website-7a3e1",
    storageBucket: "academy-website-7a3e1.firebasestorage.app",
    messagingSenderId: "42014144740",
    appId: "1:42014144740:web:b7239f75ccad686f5e54f1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspectData() {
    console.log("--- Inspecting Teacher ---");
    const teachersRef = collection(db, "users");
    const qTeacher = query(teachersRef, where("email", "==", "bassdy@wheemusic.com"));
    const teacherSnaps = await getDocs(qTeacher);

    if (teacherSnaps.empty) {
        console.log("No teacher found with email: bassdy@wheemusic.com");
    } else {
        teacherSnaps.forEach(doc => {
            console.log(`Teacher found: ${doc.id}`);
            console.log(doc.data());
        });
    }

    console.log("\n--- Inspecting Students (Bass) ---");
    const studentsRef = collection(db, "students");
    const qStudents = query(studentsRef, where("instrument", "==", "베이스"));
    const studentSnaps = await getDocs(qStudents);

    console.log(`Found ${studentSnaps.size} students with instrument '베이스'.`);
    studentSnaps.forEach(doc => {
        console.log(`Student: ${doc.data().name}, Instrument: '${doc.data().instrument}'`);
    });
}

inspectData().catch(console.error);
