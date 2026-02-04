"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParams } from "next/navigation";

interface Student {
    name: string;
    instrument: string;
}

interface LearningLog {
    progress: string;
    level: string;
    feedback: string;
    createdAt: any;
    studentName?: string;
    mediaUrl?: string;
    mediaType?: string;
    mediaTitle?: string;
}

export default function ReportPage() {
    const params = useParams();
    const studentId = params?.studentId as string;
    const logId = params?.logId as string;

    const [student, setStudent] = useState<Student | null>(null);
    const [log, setLog] = useState<LearningLog | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch log info first
                const logPath = `students/${studentId}/logs/${logId}`;

                const logDoc = await getDoc(doc(db, "students", studentId, "logs", logId));
                if (logDoc.exists()) {
                    const logData = logDoc.data() as LearningLog;
                    setLog(logData);

                    // If log has studentName, use it
                    if (logData.studentName) {
                        setStudent({ name: logData.studentName, instrument: "" }); // Partial student object
                    } else {
                        // Legacy: Try to fetch student info
                        try {
                            const studentDoc = await getDoc(doc(db, "students", studentId));
                            if (studentDoc.exists()) {
                                setStudent(studentDoc.data() as Student);
                            } else {
                                // Student exists but maybe deleted? Or permission error caught below
                                setStudent({ name: "학생", instrument: "" });
                            }
                        } catch (studentErr: any) {
                            console.warn("Could not fetch student profile (likely permission issue), using fallback.", studentErr);
                            setStudent({ name: "학생", instrument: "" });
                        }
                    }
                } else {
                    setError(true);
                }
            } catch (err: any) {
                console.error("Error fetching report data:", err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };

        if (studentId && logId) {
            fetchData();
        }
    }, [studentId, logId]);

    if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
    if (error || !student || !log) return <div className="flex h-screen items-center justify-center">리포트를 찾을 수 없습니다.</div>;

    const date = log.createdAt.toDate ? log.createdAt.toDate().toLocaleDateString() : new Date(log.createdAt.seconds * 1000).toLocaleDateString();

    return (
        <div className="min-h-screen bg-slate-50 py-10 px-4">
            <div className="mx-auto max-w-md overflow-hidden rounded-xl bg-white shadow-md">
                <div className="bg-slate-900 p-6 text-white">
                    <h1 className="text-xl font-bold mb-1">🎹 Whee Music Academy</h1>
                    <p className="text-slate-300 text-sm">학습 리포트</p>
                </div>

                <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between border-b pb-4">
                        <div>
                            <p className="text-sm text-muted-foreground">학생 이름</p>
                            <p className="text-lg font-bold">{student.name}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-muted-foreground">작성일</p>
                            <p className="font-medium">{date}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-lg bg-slate-50 p-4">
                            <h3 className="mb-2 text-sm font-semibold text-slate-500">현재 레벨</h3>
                            <p className="text-lg font-medium">{log.level || "미입력"}</p>
                        </div>

                        <div className="rounded-lg bg-slate-50 p-4">
                            <h3 className="mb-2 text-sm font-semibold text-slate-500">현재 진도</h3>
                            <p className="text-lg font-medium">{log.progress || "미입력"}</p>
                        </div>
                    </div>

                    <h3 className="mb-3 text-lg font-semibold">선생님 피드백</h3>
                    <div className="rounded-lg border bg-white p-4 text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {log.feedback}
                    </div>
                </div>

                {log.mediaUrl && (
                    <div className="px-6">
                        <h3 className="mb-3 text-lg font-semibold">첨부 미디어</h3>
                        <div className="rounded-lg border bg-white p-2">
                            {log.mediaTitle && <p className="mb-2 font-medium px-1">{log.mediaTitle}</p>}
                            {log.mediaType === 'image' ? (
                                <img src={log.mediaUrl} alt="첨부 이미지" className="w-full rounded" />
                            ) : (
                                <video controls className="w-full rounded">
                                    <source src={log.mediaUrl} />
                                </video>
                            )}
                        </div>
                    </div>
                )}

                <div className="p-6 pt-0 text-center">
                    <p className="text-xs text-muted-foreground">
                        본 리포트는 위뮤직 아카데미에서 발송된 학습 기록입니다.<br />
                        문의사항은 학원으로 연락 부탁드립니다.
                    </p>
                </div>
            </div>
        </div>
    );
}
