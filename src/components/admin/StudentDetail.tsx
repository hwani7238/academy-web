"use client";

import { useState, useEffect } from "react";
import { doc, collection, addDoc, onSnapshot, query, orderBy, deleteDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

interface TimestampLike {
    toDate?: () => Date;
    seconds?: number;
}

type FirestoreDate = Date | TimestampLike | null | undefined;

interface AppError {
    code?: string;
    message?: string;
}

interface Student {
    id: string;
    name: string;
    phone: string;
    instrument?: string;
    instruments?: string[]; // Multi-subject
    status: string;
    createdAt: FirestoreDate;
}

interface LearningLog {
    id: string;
    progress: string;
    feedback: string;
    createdAt: FirestoreDate;
    authorName?: string;
    authorId?: string;
    studentName?: string;
    mediaUrl?: string; // legacy
    mediaType?: string; // legacy
    mediaPath?: string; // legacy
    mediaTitle?: string; // legacy
    mediaFiles?: { url: string; type: string; path: string; title?: string }[];
    instrument?: string; // Subject for this log
    viewed?: boolean;
    firstViewedAt?: FirestoreDate;
    lastViewedAt?: FirestoreDate;
    viewCount?: number;
    textbookImageUrl?: string; // legacy
    textbookImagePath?: string; // legacy
    additionalTextbookImageUrl?: string; // legacy
    additionalTextbookImagePath?: string; // legacy
    textbookImages?: { url: string; path: string }[];
}

interface StudentDetailProps {
    student: Student;
    onBack: () => void;
    currentUser: {
        uid: string;
        name?: string;
        email?: string;
    };
}

const getDateValue = (date: FirestoreDate) => {
    if (!date) return null;
    if (date instanceof Date) return date;
    if (typeof date.toDate === "function") return date.toDate();
    if (typeof date.seconds === "number") return new Date(date.seconds * 1000);
    return null;
};

const isViewed = (log: Pick<LearningLog, "viewed" | "viewCount" | "firstViewedAt" | "lastViewedAt">) =>
    Boolean(log.viewed) || (log.viewCount ?? 0) > 0 || Boolean(log.firstViewedAt) || Boolean(log.lastViewedAt);

export function StudentDetail({ student, onBack, currentUser }: StudentDetailProps) {
    const studentInstruments = student.instruments && student.instruments.length > 0
        ? student.instruments
        : (student.instrument ? [student.instrument] : []);

    const [progress, setProgress] = useState("");
    const [feedback, setFeedback] = useState("");
    const [selectedInstrument, setSelectedInstrument] = useState(studentInstruments[0] || "피아노");

    const [logs, setLogs] = useState<LearningLog[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [mediaFiles, setMediaFiles] = useState<{ file: File; title: string }[]>([]);

    const [textbookUploading, setTextbookUploading] = useState(false);
    const [textbookUploadProgress, setTextbookUploadProgress] = useState(0);
    const [textbookImages, setTextbookImages] = useState<File[]>([]);

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

    const getAppError = (error: unknown): AppError => {
        if (typeof error === "object" && error !== null) {
            return error as AppError;
        }

        return {};
    };

    const handleFileUpload = async (
        file: File,
        setUploadingState: (state: boolean) => void,
        setProgressState: (progress: number) => void,
        prefix: string = ""
    ): Promise<{ url: string, path: string, type: string }> => {
        return new Promise((resolve, reject) => {
            const fileType = file.type.startsWith('image/') ? 'image' : 'video';
            const storagePath = `logs/${student.id}/${Date.now()}_${prefix}${file.name}`;
            const storageRef = ref(storage, storagePath);
            const uploadTask = uploadBytesResumable(storageRef, file);

            setUploadingState(true);

            uploadTask.on(
                "state_changed",
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setProgressState(progress);
                },
                (error) => {
                    console.error("Upload error details:", error);
                    setUploadingState(false);
                    reject(error);
                },
                async () => {
                    try {
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                        setUploadingState(false);
                        resolve({
                            url: downloadURL,
                            path: storagePath,
                            type: fileType
                        });
                    } catch (e) {
                        setUploadingState(false);
                        reject(e);
                    }
                }
            );
        });
    };

    const handleAddLog = async () => {
        if (!progress && !feedback && mediaFiles.length === 0 && textbookImages.length === 0) {
            alert("정보를 입력해주세요.");
            return;
        }

        setSaving(true);
        try {
            const uploadedTextbookImages: { url: string, path: string }[] = [];
            if (textbookImages.length > 0) {
                for (let i = 0; i < textbookImages.length; i++) {
                    const data = await handleFileUpload(textbookImages[i], setTextbookUploading, setTextbookUploadProgress, `textbook_${i}_`);
                    uploadedTextbookImages.push({ url: data.url, path: data.path });
                }
            }

            const uploadedMediaFiles: { url: string, type: string, path: string, title?: string }[] = [];
            if (mediaFiles.length > 0) {
                for (let i = 0; i < mediaFiles.length; i++) {
                    const data = await handleFileUpload(mediaFiles[i].file, setUploading, setUploadProgress, `media_${i}_`);
                    uploadedMediaFiles.push({ url: data.url, type: data.type, path: data.path, title: mediaFiles[i].title });
                }
            }

            const docData: any = {
                instrument: selectedInstrument, // Save selected instrument
                progress,
                feedback,
                authorId: currentUser.uid,
                authorName: currentUser.name || currentUser.email,
                studentName: student.name,
                createdAt: new Date(),
                textbookImages: uploadedTextbookImages,
                mediaFiles: uploadedMediaFiles
            };

            const docRef = await addDoc(collection(db, "students", student.id, "logs"), docData);

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
                        templateId: 'FEEDBACK_LOG_V2',
                        templateParameter: {
                            student_name: student.name,
                            link: linkForTemplate
                        }
                    })
                });

                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.error || `알림톡 실패 (응답): ${JSON.stringify(result)}`);
                }
            }

            setProgress("");
            setFeedback("");
            setMediaFiles([]);
            setUploadProgress(0);
            setTextbookImages([]);
            setTextbookUploadProgress(0);
            alert("학습 로그가 저장되었습니다." + (sendNotification ? " (알림 발송 시도함)" : ""));
        } catch (error) {
            console.error("Error adding log:", error);
            const appError = getAppError(error);
            let message = "저장 실패";
            if (appError.code === 'storage/unauthorized') {
                message = "파일 업로드 권한이 없습니다. 관리자에게 문의하세요.";
            } else if (appError.code === 'storage/canceled') {
                message = "파일 업로드가 취소되었습니다.";
            } else if (appError.code === 'storage/unknown') {
                message = "파일 업로드 중 알 수 없는 오류가 발생했습니다.";
            } else if (appError.message) {
                message = `저장 실패: ${appError.message}`;
            } else {
                message = `저장 실패 (상세): ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`;
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
            const deletePromises: Promise<void>[] = [];

            // Legacy properties
            if (log.mediaPath) deletePromises.push(deleteObject(ref(storage, log.mediaPath)).catch(e => console.error(e)));
            if (log.textbookImagePath) deletePromises.push(deleteObject(ref(storage, log.textbookImagePath)).catch(e => console.error(e)));
            if (log.additionalTextbookImagePath) deletePromises.push(deleteObject(ref(storage, log.additionalTextbookImagePath)).catch(e => console.error(e)));

            // Array properties
            if (log.mediaFiles) {
                log.mediaFiles.forEach(media => {
                    if (media.path) deletePromises.push(deleteObject(ref(storage, media.path)).catch(e => console.error(e)));
                });
            }
            if (log.textbookImages) {
                log.textbookImages.forEach(image => {
                    if (image.path) deletePromises.push(deleteObject(ref(storage, image.path)).catch(e => console.error(e)));
                });
            }

            await Promise.all(deletePromises);
            await deleteDoc(doc(db, "students", student.id, "logs", log.id));
        } catch (error) {
            console.error("Error deleting log:", error);
            alert("삭제 실패");
        }
    };

    const formatDate = (date: FirestoreDate) => {
        return getDateValue(date)?.toLocaleDateString() ?? "";
    };

    const formatDateTime = (date: FirestoreDate) => {
        return getDateValue(date)?.toLocaleString("ko-KR") ?? "";
    };

    const renderViewBadge = (log: LearningLog) => {
        if (isViewed(log)) {
            return (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    열람 {log.viewCount ?? 1}회
                </span>
            );
        }

        return (
            <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                미열람
            </span>
        );
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
                            <div className="grid gap-2 ml-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-slate-600">↳ 교재 사진 첨부 (최대 6장)</label>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            const fileInput = document.getElementById("textbook-upload");
                                            if (fileInput) fileInput.click();
                                        }}
                                        disabled={textbookImages.length >= 6}
                                        className="h-6 px-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                    >
                                        + 사진 추가
                                    </Button>
                                    <input
                                        id="textbook-upload"
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        multiple
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files.length > 0) {
                                                const newFiles = Array.from(e.target.files);
                                                setTextbookImages(prev => {
                                                    const combined = [...prev, ...newFiles];
                                                    return combined.slice(0, 6);
                                                });
                                            }
                                            e.target.value = "";
                                        }}
                                    />
                                </div>
                                {textbookImages.length > 0 && (
                                    <div className="flex flex-col gap-2 mt-2">
                                        {textbookImages.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between text-sm bg-slate-50 border rounded px-2 py-1">
                                                <span className="truncate text-slate-600 max-w-[200px]">{file.name}</span>
                                                <button type="button" onClick={() => setTextbookImages(prev => prev.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 font-bold px-2">&times;</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {textbookUploading && (
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary mt-1">
                                        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${textbookUploadProgress}%` }} />
                                    </div>
                                )}
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
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium">영상/사진 첨부 (최대 6개)</p>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            const fileInput = document.getElementById("media-upload");
                                            if (fileInput) fileInput.click();
                                        }}
                                        disabled={mediaFiles.length >= 6}
                                        className="h-6 px-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                    >
                                        + 미디어 추가
                                    </Button>
                                    <input
                                        id="media-upload"
                                        type="file"
                                        accept="video/*,image/*"
                                        className="hidden"
                                        multiple
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files.length > 0) {
                                                const newFiles = Array.from(e.target.files).map(file => ({ file, title: "" }));
                                                setMediaFiles(prev => {
                                                    const combined = [...prev, ...newFiles];
                                                    return combined.slice(0, 6);
                                                });
                                            }
                                            e.target.value = "";
                                        }}
                                    />
                                </div>

                                {mediaFiles.length > 0 && (
                                    <div className="flex flex-col gap-2 mt-2">
                                        {mediaFiles.map((item, idx) => (
                                            <div key={idx} className="flex flex-col gap-2 p-2 bg-slate-50 border rounded text-sm">
                                                <div className="flex items-center justify-between">
                                                    <span className="truncate text-slate-600 font-medium max-w-[200px]">{item.file.name}</span>
                                                    <button type="button" onClick={() => setMediaFiles(prev => prev.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
                                                </div>
                                                <input
                                                    className="flex h-8 w-full rounded-md border border-input px-2 py-1 text-xs"
                                                    value={item.title}
                                                    onChange={(e) => {
                                                        const newTitle = e.target.value;
                                                        setMediaFiles(prev => prev.map((mf, i) => i === idx ? { ...mf, title: newTitle } : mf));
                                                    }}
                                                    placeholder="제목 (선택, 예: 2024 봄 연주회)"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

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
                            <Button onClick={handleAddLog} disabled={saving || uploading || textbookUploading} className="w-full">
                                {saving || uploading || textbookUploading ? "저장/업로드 중..." : "학습 로그 저장"}
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
                                    <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm text-muted-foreground">
                                                {formatDate(log.createdAt)}
                                                {log.authorName && <span className="ml-2 text-xs text-blue-600 font-medium">By {log.authorName}</span>}
                                            </p>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                {renderViewBadge(log)}
                                                {isViewed(log) && log.lastViewedAt && (
                                                    <p className="text-xs text-emerald-700">
                                                        최종 열람 {formatDateTime(log.lastViewedAt)}
                                                    </p>
                                                )}
                                            </div>
                                            {isViewed(log) && (
                                                <p className="mt-1 text-xs text-emerald-700">
                                                    최초 열람: {formatDateTime(log.firstViewedAt) || "-"} · 최종 열람: {formatDateTime(log.lastViewedAt) || "-"}
                                                </p>
                                            )}
                                            {!isViewed(log) && (
                                                <p className="mt-1 text-xs text-slate-500">
                                                    학부모가 리포트를 열면 여기 상태가 바뀝니다.
                                                </p>
                                            )}
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {log.instrument && (
                                                    <p className="inline-block rounded bg-yellow-50 px-2 py-1 text-xs font-bold text-yellow-700">
                                                        {log.instrument}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                                            <Button variant="outline" size="sm" onClick={() => handleCopyLink(log.id)} className="h-7 text-xs">
                                                링크 복사
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => handleDeleteLog(log)} className="h-7 w-7 p-0 text-red-500 hover:text-red-700">
                                                &times;
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-2 text-sm">
                                        {(log.progress || log.textbookImageUrl || log.additionalTextbookImageUrl || (log.textbookImages && log.textbookImages.length > 0)) && (
                                            <div className="mb-2">
                                                {log.progress && <p><span className="font-semibold">교재:</span> {log.progress}</p>}
                                                {(log.textbookImageUrl || log.additionalTextbookImageUrl || (log.textbookImages && log.textbookImages.length > 0)) && (
                                                    <div className="mt-2 flex flex-wrap gap-2 text-sm">
                                                        {log.textbookImageUrl && (
                                                            <img src={log.textbookImageUrl} alt="교재 사진" className="max-w-[200px] rounded border bg-white object-contain" />
                                                        )}
                                                        {log.additionalTextbookImageUrl && (
                                                            <img src={log.additionalTextbookImageUrl} alt="추가 교재 사진" className="max-w-[200px] rounded border bg-white object-contain" />
                                                        )}
                                                        {log.textbookImages && log.textbookImages.map((img, idx) => (
                                                            <img key={idx} src={img.url} alt={`교재 사진 ${idx + 1}`} className="max-w-[200px] rounded border bg-white object-contain" />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {log.feedback && (
                                            <div className="p-2 bg-white rounded border">
                                                <p className="whitespace-pre-wrap">{log.feedback}</p>
                                            </div>
                                        )}
                                        {(log.mediaUrl || (log.mediaFiles && log.mediaFiles.length > 0)) && (
                                            <div className="mt-3 flex flex-col gap-4">
                                                {log.mediaUrl && (
                                                    <div className="w-full">
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
                                                {log.mediaFiles && log.mediaFiles.map((media, idx) => (
                                                    <div key={idx} className="w-full">
                                                        {media.title && <p className="font-medium mb-1">{media.title}</p>}
                                                        {media.type === 'image' ? (
                                                            <img src={media.url} alt={`첨부 이미지 ${idx + 1}`} className="w-full rounded bg-black object-contain max-h-[300px]" />
                                                        ) : (
                                                            <video controls className="w-full rounded bg-black max-h-[300px]">
                                                                <source src={media.url} />
                                                            </video>
                                                        )}
                                                    </div>
                                                ))}
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
