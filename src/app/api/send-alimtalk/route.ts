import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    const { phone, templateId, templateParameter } = await request.json();

    if (!phone || !templateId) {
        return NextResponse.json({ success: false, error: "Missing required fields: phone or templateId" }, { status: 400 });
    }

    const appKey = process.env.NHN_APP_KEY;
    const secretKey = process.env.NHN_SECRET_KEY;
    const senderKey = process.env.NHN_SENDER_KEY; // Required for AlimTalk

    // 1. Server-side Authentication Check
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ success: false, error: "Unauthorized: Missing or invalid token" }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Dynamically import adminAuth to avoid build issues if env vars are missing during static generation? 
    // Actually, route handlers are dynamic if they use headers/request.
    // We need to handle the case where adminAuth is null (misconfiguration)
    const { adminAuth } = await import('@/lib/firebase-admin');

    if (!adminAuth) {
        console.error("Firebase Admin not initialized");
        return NextResponse.json({ success: false, error: "Server Configuration Error" }, { status: 500 });
    }

    try {
        await adminAuth.verifyIdToken(idToken);
    } catch (error) {
        console.error("Token verification failed:", error);
        return NextResponse.json({ success: false, error: "Unauthorized: Invalid token" }, { status: 401 });
    }

    if (!appKey || !secretKey || !senderKey) {
        console.warn("NHN Cloud Keys are missing. Skipping actual send.");
        // In development, we might want to return success to avoid breaking the UI
        return NextResponse.json({ success: false, message: "Keys missing, simulated" });
    }

    // Example NHN Cloud AlimTalk API URL (Verify version and region)
    const url = `https://api-alimtalk.cloud.toast.com/alimtalk/v2.3/appkeys/${appKey}/messages`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'X-Secret-Key': secretKey
            },
            body: JSON.stringify({
                senderKey: senderKey,
                templateCode: templateId,
                recipientList: [{
                    recipientNo: phone,
                    templateParameter: templateParameter
                }]
            })
        });

        const data = await response.json();

        if (!response.ok || data.header?.isSuccessful === false) {
            console.error("NHN Cloud Error:", data);
            return NextResponse.json({ success: false, error: data.header?.resultMessage || "Unknown Error", details: data }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Error sending AlimTalk:", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}
