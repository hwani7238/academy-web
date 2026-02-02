import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    const { phone, templateId, templateParameter } = await request.json();

    const appKey = process.env.NHN_APP_KEY;
    const secretKey = process.env.NHN_SECRET_KEY;
    const senderKey = process.env.NHN_SENDER_KEY; // Required for AlimTalk

    if (!appKey || !secretKey || !senderKey) {
        console.warn("NHN Cloud Keys are missing. Skipping actual send.");
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

        if (!response.ok || data.header.isSuccessful === false) {
            console.error("NHN Cloud Error:", data);
            return NextResponse.json({ success: false, error: data }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Error sending AlimTalk:", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}
