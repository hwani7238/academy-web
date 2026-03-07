import { applicationDefault, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
    if (getApps().length) {
        return getApp();
    }

    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const isGoogleRuntime = Boolean(
        process.env.K_SERVICE ||
        process.env.FUNCTION_TARGET ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.FIREBASE_CONFIG
    );

    try {
        if (projectId && clientEmail && privateKey) {
            return initializeApp({
                credential: cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
            });
        }

        if (isGoogleRuntime) {
            return initializeApp({
                credential: applicationDefault(),
                projectId,
            });
        }

        console.warn("Firebase Admin is not configured. Missing service account credentials.");
        return null;
    } catch (error) {
        console.error("Failed to initialize Firebase Admin:", error);
        return null;
    }
}

const adminApp = getAdminApp();

export const adminAuth = adminApp ? getAuth(adminApp) : null;
export const adminDb = adminApp ? getFirestore(adminApp) : null;
