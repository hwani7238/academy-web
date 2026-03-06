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

const newStudentsText = `김시윤	010-3835-0314	2026.02.19
김상윤	010-3835-0314	2026.02.19
김동윤	010-3835-0314	2026.02.19
이지안 B	010-9215-0629	2026.02.20
오하윤	010-3461-5480	2026.02.20
김예서	010-4511-2051	2026.02.26
원준서	010-9855-0457	2026.03.03
유재혁	010-6899-3421	2026.03.03
고태리	010-9932-5566	2026.03.03
김시후	010-2026-2312	2026.03.04
임하준	010-8837-3893	2026.03.04
진정한	010-6771-9179	2026.03.09`;

const newStudents = newStudentsText.split('\n').filter(line => line.trim() !== '').map(line => {
    const parts = line.split('\t');
    return {
        name: parts[0].trim(),
        phone: parts[1].trim(),
        date: parts[2].trim(), // e.g. "2026.02.19"
        subject: "피아노"
    };
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
        // Match by phone AND name
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
        console.log(`Inserting new student: ${student.name} (${student.subject}, Date: ${student.date})`);

        // Parse date "2026.02.19" -> Date object
        const parts = student.date.split('.');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const createdAt = new Date(year, month, day, 12, 0, 0); // Noon

        const newDoc = {
            name: student.name,
            phone: student.phone,
            instruments: [student.subject],
            instrument: student.subject, // default legacy field
            status: "등록",
            createdAt: createdAt,
        };
        const added = await addDoc(studentsRef, newDoc);
        existingStudents.push({ id: added.id, ...newDoc });
    }
    console.log("Done!");
    process.exit(0);
}

run().catch(console.error);
