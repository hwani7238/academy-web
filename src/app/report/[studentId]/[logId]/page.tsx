"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParams } from "next/navigation";
import { Loader2, Music2, Calendar, User, Trophy, BarChart3, Quote } from "lucide-react";

interface LearningLog {
    studentName?: string;
    progress: string;
    level: string;
    feedback: string;
    createdAt: any;
    mediaUrl?: string;
    mediaType?: string;
    mediaTitle?: string;
}

export default function ReportPage() {
    const params = useParams();
    const studentId = params?.studentId as string;
    const logId = params?.logId as string;

    const [log, setLog] = useState<LearningLog | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const logDoc = await getDoc(doc(db, "students", studentId, "logs", logId));
                if (logDoc.exists()) {
                    setLog(logDoc.data() as LearningLog);
                } else {
                    setError(true);
                }
            } catch (err) {
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

    if (loading) return (
        <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
    );
    
    if (error || !log) return (
        <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] text-slate-500">
            리포트를 찾을 수 없습니다.
        </div>
    );

    const date = log.createdAt.toDate ? log.createdAt.toDate().toLocaleDateString() : new Date(log.createdAt.seconds * 1000).toLocaleDateString();

    return (
        <div className="min-h-screen bg-[#f5f5f7] py-12 px-4 md:px-6">
            <div className="mx-auto max-w-lg space-y-6">
                
                {/* Header Section */}
                <div className="text-center space-y-2 mb-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-black text-white shadow-lg mb-2">
                        <Music2 className="w-6 h-6" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">Whee Music Academy</h1>
                    <p className="text-[#86868b] text-sm font-medium">학습 리포트</p>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
                    {/* Student Info Header */}
                    <div className="bg-slate-50/50 p-8 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                <User className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs text-[#86868b] font-medium mb-0.5">학생 이름</p>
                                <p className="text-lg font-bold text-[#1d1d1f]">{log.studentName || "학생"}</p>
                            </div>
                        </div>
                        <div className="text-right">
                             <div className="flex items-center gap-1 text-[#86868b] justify-end mb-0.5">
                                <Calendar className="w-3.5 h-3.5" />
                                <span className="text-xs font-medium">작성일</span>
                             </div>
                            <p className="font-medium text-[#1d1d1f]">{date}</p>
                        </div>
                    </div>

                    <div className="p-8 space-y-8">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-[#f5f5f7] rounded-2xl p-5">
                                <div className="flex items-center gap-2 mb-2 text-[#86868b]">
                                    <Trophy className="w-4 h-4" />
                                    <span className="text-xs font-semibold">현재 레벨</span>
                                </div>
                                <p className="text-lg font-bold text-[#1d1d1f]">{log.level || "미입력"}</p>
                            </div>
                            <div className="bg-[#f5f5f7] rounded-2xl p-5">
                                <div className="flex items-center gap-2 mb-2 text-[#86868b]">
                                    <BarChart3 className="w-4 h-4" />
                                    <span className="text-xs font-semibold">현재 진도</span>
                                </div>
                                <p className="text-lg font-bold text-[#1d1d1f]">{log.progress || "미입력"}</p>
                            </div>
                        </div>

                        {/* Feedback Section */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-[#1d1d1f]">
                                <Quote className="w-5 h-5 fill-slate-200 text-transparent" />
                                <h3 className="text-lg font-bold">선생님 피드백</h3>
                            </div>
                            <div className="text-[#1d1d1f] leading-relaxed whitespace-pre-wrap text-[17px]">
                                {log.feedback}
                            </div>
                        </div>

                        {/* Media Section */}
                        {log.mediaUrl && (
                            <div className="pt-4 border-t border-slate-100">
                                <h3 className="text-sm font-semibold text-[#86868b] mb-4">학습 영상 및 사진</h3>
                                <div className="rounded-2xl overflow-hidden bg-black shadow-lg">
                                    {log.mediaTitle && (
                                        <div className="bg-black/80 text-white text-xs py-2 px-4 backdrop-blur-sm absolute z-10 m-3 rounded-lg">
                                            {log.mediaTitle}
                                        </div>
                                    )}
                                    {log.mediaType === 'image' ? (
                                        <img src={log.mediaUrl} alt="첨부 이미지" className="w-full object-cover" />
                                    ) : (
                                        <video controls className="w-full aspect-video">
                                            <source src={log.mediaUrl} />
                                        </video>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="text-center py-4">
                    <p className="text-xs text-[#86868b] leading-relaxed">
                        본 리포트는 위뮤직 아카데미에서 발송된 공식 학습 기록입니다.<br />
                        문의사항은 학원으로 연락 부탁드립니다.
                    </p>
                </div>
            </div>
        </div>
    );
}
