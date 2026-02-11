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
    instrument?: string;
    instruments?: string[]; // Multi-subject
    status: string;
    createdAt: any;
}

interface LearningLog {
    id: string;
    progress: string;
    level: string;
    feedback: string;
    createdAt: any;
    authorName?: string;
    authorId?: string;
    studentName?: string;
    mediaUrl?: string;
    mediaType?: string;
    mediaPath?: string;
    mediaTitle?: string;
    instrument?: string; // Subject for this log
}

// ... existing interfaces ...

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
    currentUser: any;
}

export function StudentDetail({ student, onBack, currentUser }: StudentDetailProps) {
    const studentInstruments = student.instruments && student.instruments.length > 0
        ? student.instruments
        : (student.instrument ? [student.instrument] : []);

    const [progress, setProgress] = useState("");
    const [level, setLevel] = useState("");
    const [feedback, setFeedback] = useState("");
    const [selectedInstrument, setSelectedInstrument] = useState(studentInstruments[0] || "피아노");

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

        return () => {
            unsubscribeLogs();
        };
    }, [student.id]);

    const [sendNotification, setSendNotification] = useState(true);

    const handleFileUpload = async (file: File): Promise<{ url: string, path: string, type: string }> => {
        return new Promise((resolve, reject) => {
            const fileType = file.type.startsWith('image/') ? 'image' : 'video';
            const storagePath = `logs/${student.id}/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, storagePath);
            const uploadTask = uploadBytesResumable(storageRef, file);

            setUploading(true);

            uploadTask.on(
                "state_changed",
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setUploadProgress(progress);
                },
                (error) => {
                    console.error("Upload error details:", error);
                    setUploading(false);
                    reject(error);
                },
                async () => {
                    try {
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                        setUploading(false);
                        resolve({
                            url: downloadURL,
                            path: storagePath,
                            type: fileType
                        });
                    } catch (e) {
                        setUploading(false);
                        reject(e);
                    }
                }
            );
        });
    };

    const handleAddLog = async () => {
        if (!progress && !level && !feedback && !mediaFile) {
            alert("정보를 입력해주세요.");
            return;
        }

        setSaving(true);
        try {
            let mediaData = { url: "", path: "", type: "" };

            if (mediaFile) {
                mediaData = await handleFileUpload(mediaFile);
            }

            const docRef = await addDoc(collection(db, "students", student.id, "logs"), {
                instrument: selectedInstrument, // Save selected instrument
                progress,
                level,
                feedback,
                authorId: currentUser.uid,
                authorName: currentUser.name || currentUser.email,
                studentName: student.name,
                createdAt: new Date(),
                mediaUrl: mediaData.url,
                mediaType: mediaData.type,
                mediaPath: mediaData.path,
                mediaTitle: mediaTitle
            });

            if (sendNotification) {
                const reportLink = `${window.location.origin}/report/${student.id}/${docRef.id}`;

                // Remove protocol from link because the template alimtalk button forces a protocol prefix (e.g. https://#{link})
                const linkForTemplate = reportLink.replace(/^https?:\/\//, '');

                // Get ID token for API authentication
                const idToken = await import('@/lib/firebase').then(m => m.auth.currentUser?.getIdToken());

                if (!idToken) {
                    throw new Error("인증 토큰을 가져올 수 없습니다. 다시 로그인해주세요.");
                }

                const response = await fetch('/api/send-alimtalk', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                        phone: student.phone.replace(/-/g, ''), // Remove dashes
                        templateId: 'FEEDBACK_LOG_V2_ldBhHyw6J',
                        templateParameter: {
                            student_name: student.name,
                            link: linkForTemplate
                        }
                    })
                });

                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.error || "알림톡 발송 실패");
                }
            }

            setProgress("");
            setLevel("");
            setFeedback("");
            setMediaFile(null);
            setMediaTitle("");
            setUploadProgress(0);
            alert("학습 로그가 저장되었습니다." + (sendNotification ? " (알림 발송 시도함)" : ""));
        } catch (error: any) {
            console.error("Error adding log:", error);
            let message = "저장 실패";
            if (error.code === 'storage/unauthorized') {
                message = "파일 업로드 권한이 없습니다. 관리자에게 문의하세요.";
            } else if (error.code === 'storage/canceled') {
                message = "파일 업로드가 취소되었습니다.";
            } else if (error.code === 'storage/unknown') {
                message = "파일 업로드 중 알 수 없는 오류가 발생했습니다.";
            }
            alert(message);
        } finally {
            setSaving(false);
            setUploading(false);
        }
    };

    const handleCopyLink = (logId: string) => {
        const link = `${window.location.origin}/report/${student.id}/${logId}`;
        navigator.clipboard.writeText(link).then(() => {
            alert("리포트 링크가 복사되었습니다. 학부모님께 전달해주세요!");
        });
    };

    const handleDeleteLog = async (log: LearningLog) => {
        if (!confirm("정말 삭제하시겠습니까?")) return;
        try {
            // Delete media if exists
            if (log.mediaPath) {
                try {
                    const mediaRef = ref(storage, log.mediaPath);
                    await deleteObject(mediaRef);
                } catch (e) {
                    console.error("Error deleting media file:", e);
                }
            }
            await deleteDoc(doc(db, "students", student.id, "logs", log.id));
        } catch (error) {
            console.error("Error deleting log:", error);
            alert("삭제 실패");
        }
    };

    const formatDate = (date: any) => {
        if (!date) return "";
        if (date.toDate) return date.toDate().toLocaleDateString();
        if (date instanceof Date) return date.toLocaleDateString();
        if (typeof date.seconds === 'number') return new Date(date.seconds * 1000).toLocaleDateString();
        return "";
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <Button variant="outline" onClick={onBack}>
                    &larr; 뒤로가기
                </Button>
                <h2 className="text-2xl font-bold">
                    {student.name} 학생
                    <span className="text-lg font-normal text-muted-foreground ml-2">
                        ({studentInstruments.join(", ")})
                    </span>
                </h2>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Info Management & Upload Form */}
                <div className="space-y-6">
                    <div className="rounded-lg border p-6 shadow-sm">
                        <h3 className="mb-4 text-lg font-semibold">새로운 학습 로그 작성</h3>
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-600">
                            <p className="font-bold text-sm mb-1">📢 피드백 작성 가이드 (필독)</p>
                            <p className="text-sm">절대 부정적 단어 사용 금지</p>
                            <p className="text-xs mt-1 opacity-90">예) 태도가 좋지 않아 (X) → ~을 ~하면 더 나은 연주를 할 수 있을 거에요! (O)</p>
                        </div>
                        <div className="space-y-4">
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">과목 (피드백 대상)</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                                    value={selectedInstrument}
                                    onChange={(e) => setSelectedInstrument(e.target.value)}
                                >
                                    {studentInstruments.map((inst) => (
                                        <option key={inst} value={inst}>{inst}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">교재</label>
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

                            <hr className="my-4 border-t" />

                            <div className="space-y-4">
                                <p className="text-sm font-medium">영상/사진 첨부 (선택)</p>
                                <div className="grid gap-2">
                                    <label className="text-xs text-muted-foreground">제목 (선택)</label>
                                    <input
                                        className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                                        value={mediaTitle}
                                        onChange={(e) => setMediaTitle(e.target.value)}
                                        placeholder="예: 2024 봄 연주회"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <input
                                        type="file"
                                        accept="video/*,image/*"
                                        className="flex w-full rounded-md border border-input px-3 py-2 text-sm"
                                        onChange={(e) => setMediaFile(e.target.files ? e.target.files[0] : null)}
                                    />
                                </div>
                                {uploading && (
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                                        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center space-x-2 pt-2">
                                <input
                                    type="checkbox"
                                    id="notify"
                                    className="h-4 w-4 rounded border-gray-300"
                                    checked={sendNotification}
                                    onChange={(e) => setSendNotification(e.target.checked)}
                                />
                                <label htmlFor="notify" className="text-sm font-medium">학부모님께 알림톡 발송</label>
                            </div>
                            <Button onClick={handleAddLog} disabled={saving || uploading} className="w-full">
                                {saving || uploading ? "저장/업로드 중..." : "학습 로그 저장"}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Learning Log History */}
                <div className="space-y-6">
                    <div className="rounded-lg border p-6 shadow-sm">
                        <h3 className="mb-4 text-lg font-semibold">학습 기록 ({logs.length})</h3>
                        <div className="max-h-[600px] overflow-y-auto space-y-4">
                            {logs.map((log) => (
                                <div key={log.id} className="rounded-md border p-4 bg-slate-50">
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="text-sm text-muted-foreground">
                                            {formatDate(log.createdAt)}
                                            {log.authorName && <span className="ml-2 text-xs text-blue-600 font-medium">By {log.authorName}</span>}
                                        </p>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={() => handleCopyLink(log.id)} className="h-7 text-xs">
                                                링크 복사
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => handleDeleteLog(log)} className="h-7 w-7 p-0 text-red-500 hover:text-red-700">
                                                &times;
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-2 text-sm">
                                        {log.instrument && <p className="px-2 py-1 bg-yellow-50 inline-block rounded text-xs font-bold text-yellow-700 mb-1">{log.instrument}</p>}
                                        {log.progress && <p><span className="font-semibold">교재:</span> {log.progress}</p>}
                                        {log.level && <p><span className="font-semibold">레벨:</span> {log.level}</p>}
                                        {log.feedback && (
                                            <div className="p-2 bg-white rounded border">
                                                <p className="whitespace-pre-wrap">{log.feedback}</p>
                                            </div>
                                        )}
                                        {log.mediaUrl && (
                                            <div className="mt-3">
                                                {log.mediaTitle && <p className="font-medium mb-1">{log.mediaTitle}</p>}
                                                {log.mediaType === 'image' ? (
                                                    <img src={log.mediaUrl} alt="첨부 이미지" className="w-full rounded bg-black object-contain max-h-[300px]" />
                                                ) : (
                                                    <video controls className="w-full rounded bg-black max-h-[300px]">
                                                        <source src={log.mediaUrl} />
                                                    </video>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {logs.length === 0 && (
                                <p className="text-center text-muted-foreground py-8">작성된 학습 로그가 없습니다.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
