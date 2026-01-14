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
    progress?: string;
    level?: string;
    feedback?: string;
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
    const [progress, setProgress] = useState(student.progress || "");
    const [level, setLevel] = useState(student.level || "");
    const [feedback, setFeedback] = useState(student.feedback || "");
    const [videos, setVideos] = useState<Video[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoTitle, setVideoTitle] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Subscribe to videos subcollection
        const q = query(collection(db, "students", student.id, "videos"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const videoData: Video[] = [];
            snapshot.forEach((doc) => {
                videoData.push({ id: doc.id, ...doc.data() } as Video);
            });
            setVideos(videoData);
        });

        return () => unsubscribe();
    }, [student.id]);

    const handleSaveInfo = async () => {
        setSaving(true);
        try {
            await updateDoc(doc(db, "students", student.id), {
                progress,
                level,
                feedback
            });
            alert("저장되었습니다.");
        } catch (error) {
            console.error("Error updating student info:", error);
            alert("저장 실패");
        } finally {
            setSaving(false);
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
                <div className="rounded-lg border p-6 shadow-sm">
                    <h3 className="mb-4 text-lg font-semibold">학습 정보 관리</h3>
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
                        <Button onClick={handleSaveInfo} disabled={saving} className="w-full">
                            {saving ? "저장 중..." : "정보 저장"}
                        </Button>
                    </div>
                </div>

                {/* Video Management */}
                <div className="rounded-lg border p-6 shadow-sm">
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
                                className="flex w-full rounded-md border border-input px-3 py-2 text-sm" // simple styling
                                onChange={(e) => setVideoFile(e.target.files ? e.target.files[0] : null)}
                                required
                            />
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
                        <div className="max-h-[300px] overflow-y-auto space-y-3">
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
                                    <p className="mt-1 text-xs text-muted-foreground">{new Date(video.createdAt.seconds * 1000).toLocaleDateString()}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
