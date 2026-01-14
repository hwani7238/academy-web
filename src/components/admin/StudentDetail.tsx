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

interface Video {
    id: string;
    title: string;
    url: string;
    createdAt: any;
    storagePath: string;
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
    const [videos, setVideos] = useState<Video[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoTitle, setVideoTitle] = useState("");
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

        // Subscribe to videos subcollection
        const videosQuery = query(collection(db, "students", student.id, "videos"), orderBy("createdAt", "desc"));
        const unsubscribeVideos = onSnapshot(videosQuery, (snapshot) => {
            const videoData: Video[] = [];
            snapshot.forEach((doc) => {
                videoData.push({ id: doc.id, ...doc.data() } as Video);
            });
            setVideos(videoData);
        });

        return () => {
            unsubscribeLogs();
            unsubscribeVideos();
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

            // Update main student document with latest info for quick access if needed (optional, keeping it clean for now)
            // But user requirement specifically asked for a LIST below.

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

    const handleUploadVideo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!videoFile || !videoTitle) return;

        setUploading(true);
        const storagePath = `videos/${student.id}/${Date.now()}_${videoFile.name}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, videoFile);

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
                    title: videoTitle,
                    url: downloadURL,
                    storagePath: storagePath,
                    createdAt: new Date()
                });

                setUploading(false);
                setVideoFile(null);
                setVideoTitle("");
                setUploadProgress(0);
                alert("영상 업로드 완료");
            }
        );
    };

    const handleDeleteVideo = async (video: Video) => {
        if (!confirm("정말 삭제하시겠습니까?")) return;

        try {
            // Delete from Storage
            const videoRef = ref(storage, video.storagePath);
            await deleteObject(videoRef);

            // Delete from Firestore
            await deleteDoc(doc(db, "students", student.id, "videos", video.id));
        } catch (error) {
            console.error("Delete video error:", error);
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
                {/* Info Management */}
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

                {/* Video Management */}
                <div className="rounded-lg border p-6 shadow-sm h-fit">
                    <h3 className="mb-4 text-lg font-semibold">연주 영상 업로드</h3>
                    <form onSubmit={handleUploadVideo} className="mb-6 space-y-4">
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">영상 제목</label>
                            <input
                                className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                                value={videoTitle}
                                onChange={(e) => setVideoTitle(e.target.value)}
                                placeholder="예: 2024 봄 연주회"
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">영상 파일</label>
                            <input
                                type="file"
                                accept="video/*"
                                className="flex w-full rounded-md border border-input px-3 py-2 text-sm"
                                onChange={(e) => setVideoFile(e.target.files ? e.target.files[0] : null)}
                                required
                            />
                            <p className="text-xs text-muted-foreground">모바일에서도 바로 영상을 선택하거나 촬영하여 업로드할 수 있습니다.</p>
                        </div>
                        {uploading && (
                            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                            </div>
                        )}
                        <Button type="submit" disabled={uploading} className="w-full">
                            {uploading ? `업로드 중 ${Math.round(uploadProgress)}%` : "영상 업로드"}
                        </Button>
                    </form>

                    <div className="space-y-4">
                        <h4 className="font-medium">업로드된 영상 ({videos.length})</h4>
                        <div className="max-h-[500px] overflow-y-auto space-y-3">
                            {videos.map((video) => (
                                <div key={video.id} className="rounded-md border p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="font-medium">{video.title}</span>
                                        <Button variant="ghost" size="sm" onClick={() => handleDeleteVideo(video)} className="text-red-500 hover:text-red-700">
                                            삭제
                                        </Button>
                                    </div>
                                    <video controls className="w-full rounded bg-black">
                                        <source src={video.url} />
                                    </video>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {video.createdAt.toDate ? video.createdAt.toDate().toLocaleDateString() : new Date(video.createdAt.seconds * 1000).toLocaleDateString()}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
