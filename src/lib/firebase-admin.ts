import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    // Check if we have the service account key (preferred for local/custom)
    // or if we are in a Google Cloud environment (like Vercel with Google integration or Cloud Functions)
    // For this simple implementation, we'll try to use standard env vars often used with Next.js + Firebase

    // Note: You need to set these environment variables in .env.local
    // FIREBASE_PROJECT_ID
    // FIREBASE_CLIENT_EMAIL
    // FIREBASE_PRIVATE_KEY

    if (process.env.FIREBASE_PRIVATE_KEY) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // Handle private key newlines
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
        });
    } else {
        // Fallback for environments where default credentials might work 
        // (e.g. if deployed to Firebase Hosting/Functions internally, though Next.js is usually Vercel)
        // Or just print a warning if we can't initialize
        console.warn("Missing FIREBASE_PRIVATE_KEY. Firebase Admin not fully initialized.");
        if (process.env.NODE_ENV === 'development') {
            // In dev, maybe we don't init or we try default
            // admin.initializeApp(); 
        }
    }
}

export const adminAuth = admin.apps.length ? admin.auth() : null;
