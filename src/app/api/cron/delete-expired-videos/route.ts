import { NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function GET(request: Request) {
    // 보안 체크: Vercel Cron 요청 확인
    const authHeader = request.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!adminDb || !adminStorage) {
        return new NextResponse("Firebase Admin is not initialized", { status: 500 });
    }

    try {
        const bucket = adminStorage.bucket();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Firestore collection group query for 'logs'
        const logsSnapshot = await adminDb.collectionGroup("logs")
            .where("createdAt", "<", thirtyDaysAgo)
            .get();

        const results = {
            processed: 0,
            deletedVideos: 0,
            errors: 0,
        };

        const batch = adminDb.batch();
        let batchCount = 0;

        for (const doc of logsSnapshot.docs) {
            results.processed++;
            const data = doc.data();
            let hasChanges = false;
            let videoDeleted = false;
            
            const updateData: any = {};

            // 레거시 단일 비디오(mediaUrl, mediaPath) 삭제
            if (data.mediaPath) {
                try {
                    await bucket.file(data.mediaPath).delete();
                    videoDeleted = true;
                    results.deletedVideos++;
                } catch (error: any) {
                    if (error.code !== 404) {
                        console.error(`Failed to delete legacy video ${data.mediaPath}:`, error);
                        results.errors++;
                    } else {
                        // 이미 지워진 경우라도 플래그 처리
                        videoDeleted = true; 
                    }
                }
                updateData.mediaPath = FieldValue.delete();
                updateData.mediaUrl = FieldValue.delete();
                hasChanges = true;
            } else if (data.mediaUrl && !data.mediaUrl.includes('images')) { 
                // mediaPath는 없지만 mediaUrl만 있는 경우 (비디오인지 확인 모호하므로 삭제 진행)
                updateData.mediaUrl = FieldValue.delete();
                hasChanges = true;
                videoDeleted = true;
            }

            // 다중 파일(mediaFiles) 중 비디오 필터링
            if (Array.isArray(data.mediaFiles) && data.mediaFiles.length > 0) {
                const initialLength = data.mediaFiles.length;
                const remainingFiles = [];

                for (const media of data.mediaFiles) {
                    if (media.type?.startsWith("video/")) {
                        if (media.path) {
                            try {
                                await bucket.file(media.path).delete();
                                videoDeleted = true;
                                results.deletedVideos++;
                            } catch (error: any) {
                                if (error.code !== 404) {
                                    console.error(`Failed to delete video ${media.path}:`, error);
                                    results.errors++;
                                } else {
                                    videoDeleted = true;
                                }
                            }
                        } else {
                             videoDeleted = true;
                        }
                    } else {
                        remainingFiles.push(media);
                    }
                }

                if (remainingFiles.length !== initialLength) {
                    updateData.mediaFiles = remainingFiles;
                    hasChanges = true;
                }
            }

            if (hasChanges) {
                if (videoDeleted && !data.videoExpired) {
                    updateData.videoExpired = true;
                }
                batch.update(doc.ref, updateData);
                batchCount++;
                
                // Firestore batch update limit is 500
                if (batchCount === 490) {
                    await batch.commit();
                    batchCount = 0;
                }
            }
        }

        if (batchCount > 0) {
            await batch.commit();
        }

        return NextResponse.json({ success: true, results });

    } catch (error: any) {
        console.error("Error in delete-expired-videos cron:", error);
        return new NextResponse(`Internal Server Error: ${error.message}`, { status: 500 });
    }
}
