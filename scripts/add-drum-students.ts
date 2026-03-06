import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs } from "firebase/firestore";

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

const newStudentsText = `이민준	010-9151-8730
조유나	010-8544-1423
최준형	010-6276-6755
김용진	010-3219-9705
이주현	010-8000-2741
백다민님	010-7517-0238
강기현	010-5017-5465
강주아	010-5017-5465
김로이	010-3300-8113
임예성	010-9505-9757
김시환	010-4578-3337
김예한	010-9174-7806
최슬아	010-6808-5687
서율	010-6599-9836
김승후	010-7372-4288
권민서	010-8728-4624
심하민	010-9530-4595
윤시후	010-3158-0322
서리라	010-2267-0748
조현애님	010-3745-3153
전미솔	010-3552-8911
박시연	010-2758-1263`;

const newStudents = newStudentsText.split('\n').filter(line => line.trim() !== '').map(line => {
    const parts = line.split('\t');
    return { name: parts[0].trim(), phone: parts[1].trim(), subject: "드럼" };
});

async function run() {
    const studentsRef = collection(db, 'students');
    const snapshot = await getDocs(studentsRef);

    // Map existing students
    const existingStudents: any[] = [];
    snapshot.forEach(doc => {
        existingStudents.push({ id: doc.id, ...doc.data() });
    });

    for (const student of newStudents) {
        // Match by phone AND name (using simple name match here as we don't have grade in this input)
        const matches = existingStudents.filter(s => {
            const samePhone = s.phone && s.phone.replace(/[^0-9]/g, '') === student.phone.replace(/[^0-9]/g, '');
            const sameName = s.name && s.name.replace(/\s+/g, '') === student.name.replace(/\s+/g, '');
            return samePhone && sameName;
        });

        if (matches.length > 0) {
            let hasSameSubject = false;
            for (const match of matches) {
                const instruments = match.instruments || [];
                if (match.instrument && !instruments.includes(match.instrument)) {
                    instruments.push(match.instrument);
                }

                if (instruments.includes(student.subject)) {
                    console.log(`Skipping duplicated subject for ${student.name} (${student.phone}): ${student.subject}`);
                    hasSameSubject = true;
                    break;
                }
            }
            if (hasSameSubject) continue;
        }

        // Insert new document
        console.log(`Inserting new student: ${student.name} (${student.subject})`);
        const newDoc = {
            name: student.name,
            phone: student.phone,
            instruments: [student.subject],
            instrument: student.subject, // default legacy field
            status: "등록",
            createdAt: new Date(),
        };
        const added = await addDoc(studentsRef, newDoc);
        existingStudents.push({ id: added.id, ...newDoc });
    }
    console.log("Done!");
    process.exit(0);
}

run().catch(console.error);
