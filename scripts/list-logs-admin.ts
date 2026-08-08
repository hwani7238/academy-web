import * as admin from "firebase-admin";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

function cleanPrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  let cleaned = key.trim();
  cleaned = cleaned.replace(/^["']|["']$/g, "");
  cleaned = cleaned.replace(/\\n/g, "\n");
  const match = cleaned.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/);
  return match ? match[0] : cleaned;
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = cleanPrivateKey(process.env.FIREBASE_PRIVATE_KEY);

if (!projectId || !clientEmail || !privateKey) {
  console.error("Missing firebase-admin environment variables in .env.local");
  process.exit(1);
}

console.log("Private Key Length:", privateKey.length);
console.log("Private Key Start:", JSON.stringify(privateKey.substring(0, 50)));
console.log("Private Key End:", JSON.stringify(privateKey.substring(privateKey.length - 50)));

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey,
  }),
});

const db = admin.firestore();

async function listLatestLogs() {
  console.log("Fetching logs with Admin SDK...");
  const studentsSnap = await db.collection("students").get();

  for (const studentDoc of studentsSnap.docs) {
    const studentData = studentDoc.data();
    const logsSnap = await db.collection(`students/${studentDoc.id}/logs`).get();

    if (logsSnap.docs.length > 0) {
      console.log(`\nStudent: ${studentData.name || "N/A"} (${studentDoc.id})`);
      for (const logDoc of logsSnap.docs) {
        const logData = logDoc.data();
        console.log(`  Log ID: ${logDoc.id}`);
        console.log(`  Report Token: ${logData.reportToken}`);
        console.log(`  Feedback snippet: "${logData.feedback?.substring(0, 30) || "None"}"`);
        console.log(`  Created At: ${logData.createdAt ? logData.createdAt.toDate().toISOString() : "N/A"}`);
      }
    }
  }
}

listLatestLogs().catch(console.error);
