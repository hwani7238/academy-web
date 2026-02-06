"use client";

import { useEffect, useState } from "react";
import { collectionGroup, query, orderBy, limit, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

interface FeedbackLog {
    id: string;
    studentName?: string;
    authorName?: string;
    feedback: string;
    createdAt: any;
    progress?: string;
    level?: string;
    mediaUrl?: string;
    mediaType?: string;
}

export function FeedbackList() {
    const [logs, setLogs] = useState<FeedbackLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState<FeedbackLog | null>(null);

    useEffect(() => {
        // Query across all 'logs' subcollections
        const q = query(
            collectionGroup(db, "logs"),
            orderBy("createdAt", "desc"),
            limit(20) // Limit to recent 20 for performance
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedLogs: FeedbackLog[] = [];
            snapshot.forEach((doc) => {
                fetchedLogs.push({ id: doc.id, ...doc.data() } as FeedbackLog);
            });
            setLogs(fetchedLogs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching feedback logs:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const formatDate = (timestamp: any) => {
        if (!timestamp) return "-";
        if (timestamp.toDate) return timestamp.toDate().toLocaleDateString();
        return new Date(timestamp.seconds * 1000).toLocaleDateString();
    };

    return (
        <div className="rounded-lg border bg-white shadow-sm">
            <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">최근 피드백 목록 (전체)</h3>
            </div>

            {loading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">목록을 불러오는 중...</div>
            ) : logs.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">등록된 피드백이 없습니다.</div>
            ) : (
                <div className="divide-y max-h-[400px] overflow-y-auto">
                    {logs.map((log) => (
                        <div
                            key={log.id}
                            className="p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => setSelectedLog(log)}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="font-medium text-slate-900">{log.studentName || "학생 미상"}</span>
                                <span className="text-xs text-slate-500">{formatDate(log.createdAt)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm text-muted-foreground mb-2">
                                <span>To: {log.studentName} / By: {log.authorName || "선생님"}</span>
                            </div>
                            <p className="text-sm text-slate-600 line-clamp-2">
                                {log.feedback || "내용 없음"}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal/Overlay for Detail View */}
            {selectedLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedLog(null)}>
                    <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-6 space-y-4">
                            <div className="flex justify-between items-start border-b pb-4">
                                <div>
                                    <h3 className="text-xl font-bold">{selectedLog.studentName} 학생 피드백</h3>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        작성자: {selectedLog.authorName} | 작성일: {formatDate(selectedLog.createdAt)}
                                    </p>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedLog(null)}>&times; 닫기</Button>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-slate-50 rounded-md">
                                        <span className="text-xs font-medium text-slate-500 block mb-1">현재 진도</span>
                                        <p className="text-sm font-medium">{selectedLog.progress || "-"}</p>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded-md">
                                        <span className="text-xs font-medium text-slate-500 block mb-1">현재 레벨</span>
                                        <p className="text-sm font-medium">{selectedLog.level || "-"}</p>
                                    </div>
                                </div>

                                <div className="p-4 border rounded-md min-h-[100px]">
                                    <span className="text-xs font-medium text-slate-500 block mb-2">피드백 내용</span>
                                    <p className="whitespace-pre-wrap leading-relaxed">{selectedLog.feedback}</p>
                                </div>

                                {selectedLog.mediaUrl && (
                                    <div className="space-y-2">
                                        <span className="text-xs font-medium text-slate-500">첨부 미디어</span>
                                        <div className="rounded-md overflow-hidden bg-black flex justify-center">
                                            {selectedLog.mediaType === 'image' ? (
                                                <img src={selectedLog.mediaUrl} alt="Feedback Media" className="max-h-[300px] object-contain" />
                                            ) : (
                                                <video src={selectedLog.mediaUrl} controls className="max-h-[300px]" />
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 flex justify-end">
                                <Button onClick={() => setSelectedLog(null)}>닫기</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
