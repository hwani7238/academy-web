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

const newStudents = [
    { subject: "피아노", name: "윤시원", phone: "010-3515-3334", date: "2025.07.02", notes: "주 2 16" },
    { subject: "댄스", name: "강민서 A", phone: "010-9467-8494", date: "2025.06.21", notes: "키즈댄스 주 1", grade: "초3" },
    { subject: "댄스", name: "김래아", phone: "010-9149-9303", date: "2025.06.21", notes: "키즈댄스 주 1", grade: "초2" },
    { subject: "댄스", name: "현유주", phone: "010-8887-6504", date: "2025.06.28", notes: "키즈댄스 주 1", grade: "초2" },
    { subject: "댄스", name: "정서윤", phone: "010-9015-3285", date: "2025.09.06", notes: "키즈댄스 주 1", grade: "초2" },
    { subject: "댄스", name: "정서아", phone: "010-9015-3285", date: "2025.09.06", notes: "키즈댄스 주 1", grade: "초2" },
    { subject: "댄스", name: "안채원", phone: "010-3132-9986", date: "2025.06.28", notes: "키즈댄스 주 1", grade: "초1" },
    { subject: "보컬", name: "조준혁", phone: "010-9113-4871", date: "2023.12.20", notes: "고등 취미 보컬 주 1 16" },
    { subject: "보컬", name: "주필립", phone: "010-2001-7004", date: "2024.07.11", notes: "중등 취미 보컬 주 1 18" },
    { subject: "보컬", name: "한효수님", phone: "010-3778-9916", date: "2024.11.02", notes: "성인 취미 성악 주 1 18" },
    { subject: "보컬", name: "유도훈", phone: "010-2429-0866", date: "2025.08", notes: "중등 취미 보컬 주 1 18" },
    { subject: "보컬", name: "백아연", phone: "010-8801-7008", date: "2025.08", notes: "시창,청음 주 1 15" },
    { subject: "기타", name: "배주은", phone: "010-2925-8087", date: "2025.09.13", notes: "어린이 취미 기타 주 1" },
    { subject: "기타", name: "임율언", phone: "010-6314-1276", date: "", notes: "중등 취미 기타 주 1" },
    { subject: "기타", name: "김시원", phone: "010-6398-3643", date: "2026.01.03", notes: "초등 취미 기타 주 1" },
    { subject: "미디", name: "강신욱", phone: "010-7548-9877", date: "", notes: "미디 주 1" },
    { subject: "미디", name: "김민정님", phone: "010-6771-9179", date: "", notes: "(시창,청음) 주 1" },
];

async function run() {
    const studentsRef = collection(db, 'students');
    const snapshot = await getDocs(studentsRef);

    // Map existing students by phone and name
    const existingStudents: any[] = [];
    snapshot.forEach(doc => {
        existingStudents.push({ id: doc.id, ...doc.data() });
    });

    for (const student of newStudents) {
        const matches = existingStudents.filter(s => {
            const samePhone = s.phone && s.phone.replace(/[^0-9]/g, '') === student.phone.replace(/[^0-9]/g, '');
            const targetName = student.grade ? `${student.name} (${student.grade})` : student.name;
            const sameName = s.name && s.name.replace(/\s+/g, '') === targetName.replace(/\s+/g, '');
            return samePhone && sameName;
        });

        let parsedDate = null;
        if (student.date) {
            const parts = student.date.split('.');
            if (parts.length === 3) {
                parsedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            } else if (parts.length === 2) {
                parsedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
            }
        }
        if (!parsedDate || isNaN(parsedDate.getTime())) {
            parsedDate = new Date();
        }

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
        const fullName = student.grade ? `${student.name} (${student.grade})` : student.name;
        console.log(`Inserting new student: ${fullName} (${student.subject})`);
        const newDoc = {
            name: fullName,
            phone: student.phone,
            instruments: [student.subject],
            instrument: student.subject, // default initial
            status: "등록",
            createdAt: parsedDate,
            enrollmentNotes: student.notes,
        };
        const added = await addDoc(studentsRef, newDoc);
        existingStudents.push({ id: added.id, ...newDoc });
    }
    console.log("Done!");
    process.exit(0);
}

run().catch(console.error);
