"use client";

import { useState, useEffect } from "react";
import { doc, updateDoc, collection, addDoc, onSnapshot, query, orderBy, deleteDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

interface Student {
    id: string;
    name: string;
    phone: string;
    instrument: string;
    status: string;
    createdAt: any;
}

interface LearningLog {
    id: string;
    progress: string;
    level: string;
    feedback: string;
    createdAt: any;
}

interface MediaItem {
    id: string;
    title: string;
    url: string;
    createdAt: any;
    storagePath: string;
    type?: 'video' | 'image';
}

interface StudentDetailProps {
    student: Student;
    onBack: () => void;
}

export function StudentDetail({ student, onBack }: StudentDetailProps) {
    const [progress, setProgress] = useState("");
    const [level, setLevel] = useState("");
    const [feedback, setFeedback] = useState("");
    const [logs, setLogs] = useState<LearningLog[]>([]);
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaTitle, setMediaTitle] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Subscribe to learning logs subcollection
        const logsQuery = query(collection(db, "students", student.id, "logs"), orderBy("createdAt", "desc"));
        const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
            const logsData: LearningLog[] = [];
            snapshot.forEach((doc) => {
                logsData.push({ id: doc.id, ...doc.data() } as LearningLog);
            });
            setLogs(logsData);
        });

        // Subscribe to videos subcollection (keeping collection name for backward compatibility, but treating as generic media)
        const mediaQuery = query(collection(db, "students", student.id, "videos"), orderBy("createdAt", "desc"));
        const unsubscribeMedia = onSnapshot(mediaQuery, (snapshot) => {
            const items: MediaItem[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                items.push({
                    id: doc.id,
                    ...data,
                    // If type is missing (legacy data), assume video logic or check extension? 
                    // For now default to video if unsure, but new items will have type.
                    type: data.type || 'video'
                } as MediaItem);
            });
            setMediaItems(items);
        });

        return () => {
            unsubscribeLogs();
            unsubscribeMedia();
        };
    }, [student.id]);

    const handleAddLog = async () => {
        if (!progress && !level && !feedback) {
            alert("정보를 입력해주세요.");
            return;
        }

        setSaving(true);
        try {
            await addDoc(collection(db, "students", student.id, "logs"), {
                progress,
                level,
                feedback,
                createdAt: new Date()
            });

            setProgress("");
            setLevel("");
            setFeedback("");
            alert("학습 로그가 저장되었습니다.");
        } catch (error) {
            console.error("Error adding log:", error);
            alert("저장 실패");
        } finally {
            setSaving(false);
        }
    };

    const handleCopyLink = (logId: string) => {
        const link = `${window.location.origin}/report/${student.id}/${logId}`;
        navigator.clipboard.writeText(link).then(() => {
            alert("리포트 링크가 복사되었습니다. 학부모님께 전달해주세요!");
        });
    };

    const handleDeleteLog = async (logId: string) => {
        if (!confirm("정말 삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(db, "students", student.id, "logs", logId));
        } catch (error) {
            console.error("Error deleting log:", error);
            alert("삭제 실패");
        }
    };

    const handleUploadMedia = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mediaFile || !mediaTitle) return;

        setUploading(true);
        const fileType = mediaFile.type.startsWith('image/') ? 'image' : 'video';
        const storagePath = `videos/${student.id}/${Date.now()}_${mediaFile.name}`; // Keep path consistent or rename? 'videos' folder is fine
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, mediaFile);

        uploadTask.on(
            "state_changed",
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(progress);
            },
            (error) => {
                console.error("Upload error:", error);
                alert("업로드 실패");
                setUploading(false);
            },
            async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                await addDoc(collection(db, "students", student.id, "videos"), {
                    title: mediaTitle,
                    url: downloadURL,
                    storagePath: storagePath,
                    type: fileType,
                    createdAt: new Date()
                });

                setUploading(false);
                setMediaFile(null);
                setMediaTitle("");
                setUploadProgress(0);
                alert("업로드 완료");
            }
        );
    };

    const handleDeleteMedia = async (item: MediaItem) => {
        if (!confirm("정말 삭제하시겠습니까?")) return;

        try {
            // Delete from Storage
            const mediaRef = ref(storage, item.storagePath);
            await deleteObject(mediaRef);

            // Delete from Firestore
            await deleteDoc(doc(db, "students", student.id, "videos", item.id));
        } catch (error) {
            console.error("Delete media error:", error);
            alert("삭제 실패");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <Button variant="outline" onClick={onBack}>
                    &larr; 뒤로가기
                </Button>
                <h2 className="text-2xl font-bold">{student.name} 학생 상세 정보</h2>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Info Management & Upload Form */}
                <div className="space-y-6">
                    <div className="rounded-lg border p-6 shadow-sm">
                        <h3 className="mb-4 text-lg font-semibold">새로운 학습 로그 작성</h3>
                        <div className="space-y-4">
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">현재 진도</label>
                                <input
                                    className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                                    value={progress}
                                    onChange={(e) => setProgress(e.target.value)}
                                    placeholder="예: 바이엘 3권"
                                />
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">현재 레벨</label>
                                <input
                                    className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                                    value={level}
                                    onChange={(e) => setLevel(e.target.value)}
                                    placeholder="예: 초급"
                                />
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">피드백</label>
                                <textarea
                                    className="flex min-h-[100px] w-full rounded-md border border-input px-3 py-2 text-sm"
                                    value={feedback}
                                    onChange={(e) => setFeedback(e.target.value)}
                                    placeholder="학생에 대한 피드백을 입력하세요."
                                />
                            </div>
                            <Button onClick={handleAddLog} disabled={saving} className="w-full">
                                {saving ? "저장 중..." : "학습 로그 저장"}
                            </Button>

                            <hr className="my-6 border-t" />

                            {/* Media Upload Section Moved Here */}
                            <div>
                                <h3 className="mb-4 text-lg font-semibold">연주 영상/사진 업로드</h3>
                                <form onSubmit={handleUploadMedia} className="space-y-4">
                                    <div className="grid gap-2">
                                        <label className="text-sm font-medium">제목</label>
                                        <input
                                            className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                                            value={mediaTitle}
                                            onChange={(e) => setMediaTitle(e.target.value)}
                                            placeholder="예: 2024 봄 연주회"
                                            required
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <label className="text-sm font-medium">파일 선택</label>
                                        <input
                                            type="file"
                                            accept="video/*,image/*"
                                            className="flex w-full rounded-md border border-input px-3 py-2 text-sm"
                                            onChange={(e) => setMediaFile(e.target.files ? e.target.files[0] : null)}
                                            required
                                        />
                                        <p className="text-xs text-muted-foreground">모바일에서도 바로 선택하거나 촬영하여 업로드할 수 있습니다.</p>
                                    </div>
                                    {uploading && (
                                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                                            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                        </div>
                                    )}
                                    <Button type="submit" disabled={uploading} variant="secondary" className="w-full">
                                        {uploading ? `업로드 중 ${Math.round(uploadProgress)}%` : "업로드"}
                                    </Button>
                                </form>
                            </div>
                        </div>
                    </div>

                    {/* Learning Log History */}
                    <div className="rounded-lg border p-6 shadow-sm">
                        <h3 className="mb-4 text-lg font-semibold">학습 기록 ({logs.length})</h3>
                        <div className="max-h-[400px] overflow-y-auto space-y-4">
                            {logs.map((log) => (
                                <div key={log.id} className="rounded-md border p-4 bg-slate-50">
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="text-sm text-muted-foreground">
                                            {log.createdAt.toDate ? log.createdAt.toDate().toLocaleDateString() : new Date(log.createdAt.seconds * 1000).toLocaleDateString()}
                                        </p>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={() => handleCopyLink(log.id)} className="h-7 text-xs">
                                                링크 복사
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => handleDeleteLog(log.id)} className="h-7 w-7 p-0 text-red-500 hover:text-red-700">
                                                &times;
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-1 text-sm">
                                        {log.progress && <p><span className="font-semibold">진도:</span> {log.progress}</p>}
                                        {log.level && <p><span className="font-semibold">레벨:</span> {log.level}</p>}
                                        {log.feedback && (
                                            <div className="mt-2 p-2 bg-white rounded border">
                                                <p className="whitespace-pre-wrap">{log.feedback}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Uploaded Media List (Moved from bottom of left or was separate? It was right column before under 'Video Management') */}
                <div className="space-y-6">
                    <div className="rounded-lg border p-6 shadow-sm h-fit">
                        <h3 className="font-semibold text-lg mb-4">업로드된 미디어 ({mediaItems.length})</h3>
                        <div className="max-h-[600px] overflow-y-auto space-y-4">
                            {mediaItems.map((item) => (
                                <div key={item.id} className="rounded-md border p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="font-medium">{item.title}</span>
                                        <Button variant="ghost" size="sm" onClick={() => handleDeleteMedia(item)} className="text-red-500 hover:text-red-700">
                                            삭제
                                        </Button>
                                    </div>

                                    {item.type === 'image' ? (
                                        <img src={item.url} alt={item.title} className="w-full rounded bg-black object-contain max-h-[300px]" />
                                    ) : (
                                        <video controls className="w-full rounded bg-black max-h-[300px]">
                                            <source src={item.url} />
                                        </video>
                                    )}

                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {item.createdAt.toDate ? item.createdAt.toDate().toLocaleDateString() : new Date(item.createdAt.seconds * 1000).toLocaleDateString()}
                                    </p>
                                </div>
                            ))}
                            {mediaItems.length === 0 && (
                                <p className="text-center text-muted-foreground py-8">업로드된 영상이나 사진이 없습니다.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
