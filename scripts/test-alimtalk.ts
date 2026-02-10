import * as dotenv from 'dotenv';

// Load .env.local
dotenv.config({ path: '.env.local' });

// Configuration
// TODO: Replace with actual values for testing
const TARGET_PHONE = "01040982153";
const TEMPLATE_ID = "FEEDBACK_LOG_V2";

async function sendAlimTalk() {
    console.log("Starting AlimTalk Test...");

    const appKey = process.env.NHN_APP_KEY;
    const secretKey = process.env.NHN_SECRET_KEY;
    const senderKey = process.env.NHN_SENDER_KEY;

    if (!appKey || !secretKey || !senderKey) {
        console.error("Error: Missing NHN Cloud keys in .env.local");
        return;
    }

    console.log(`Using AppKey: ${appKey}`);
    console.log(`Using SenderKey: ${senderKey}`);

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
                templateCode: TEMPLATE_ID,
                recipientList: [{
                    recipientNo: TARGET_PHONE,
                    templateParameter: {
                        student_name: "테스트학생",
                        link: "example.com"
                    }
                }]
            })
        });

        const data = await response.json();
        console.log("Response Status:", response.status);
        console.log("Response Body:", JSON.stringify(data, null, 2));

        if (!response.ok || data.header?.isSuccessful === false) {
            console.error("❌ Send Failed");
        } else {
            console.log("✅ Send Successful");
        }

    } catch (error) {
        console.error("Error sending request:", error);
    }
}

sendAlimTalk();
