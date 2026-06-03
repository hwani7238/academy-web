import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

const serializeFirestore = (data: any): any => {
    if (!data) return data;
    const serialized = { ...data };
    for (const key of Object.keys(serialized)) {
        const val = serialized[key];
        if (val && typeof val.toDate === "function") {
            serialized[key] = val.toDate().toISOString();
        } else if (val && typeof val === "object" && ("seconds" in val || "_seconds" in val)) {
            const sec = val.seconds ?? val._seconds;
            serialized[key] = new Date(sec * 1000).toISOString();
        } else if (Array.isArray(val)) {
            serialized[key] = val.map(v => (typeof v === "object" && v !== null ? serializeFirestore(v) : v));
        } else if (typeof val === "object" && val !== null) {
            serialized[key] = serializeFirestore(val);
        }
    }
    return serialized;
};

export async function POST(request: Request) {
    if (!adminDb) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    try {
        const { digits } = await request.json();

        if (!digits || typeof digits !== "string" || digits.length !== 4) {
            return NextResponse.json({ error: "Invalid digits. Must be exactly 4 digits." }, { status: 400 });
        }

        // Query all students from Firestore via adminDb
        const studentsSnap = await adminDb.collection("students").get();
        const matches: any[] = [];

        // Filter students by phone number ending in the last 4 digits
        for (const doc of studentsSnap.docs) {
            const studentData = doc.data();
            const rawPhone = studentData.phone || "";
            const strippedPhone = rawPhone.replace(/[^0-9]/g, "");

            if (strippedPhone.endsWith(digits)) {
                // Fetch student logs subcollection
                const logsSnap = await adminDb
                    .collection("students")
                    .doc(doc.id)
                    .collection("logs")
                    .orderBy("createdAt", "desc")
                    .limit(10)
                    .get();

                const logs: any[] = [];
                logsSnap.forEach(logDoc => {
                    logs.push({
                        id: logDoc.id,
                        ...serializeFirestore(logDoc.data()),
                    });
                });

                matches.push({
                    student: {
                        id: doc.id,
                        name: studentData.name,
                        instruments: studentData.instruments || (studentData.instrument ? [studentData.instrument] : []),
                        createdAt: serializeFirestore(studentData.createdAt),
                    },
                    logs,
                });
            }
        }

        return NextResponse.json({ ok: true, matches });
    } catch (error) {
        console.error("Error in world login API:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
