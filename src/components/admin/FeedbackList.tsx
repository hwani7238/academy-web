"use client";

import { useEffect, useState } from "react";
import { collectionGroup, query, orderBy, getDocs, onSnapshot, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { DayPicker } from "react-day-picker";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
    instrument?: string;
}

export function FeedbackList() {
    // ... (state remains valid)
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
    const [dailyLogs, setDailyLogs] = useState<FeedbackLog[]>([]);
    const [loadingDaily, setLoadingDaily] = useState(false);
    const [markedDates, setMarkedDates] = useState<Date[]>([]);
    const [selectedLog, setSelectedLog] = useState<FeedbackLog | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [indexLink, setIndexLink] = useState<string | null>(null);

    // ... (effects remain valid)

    // ... (formatting functions remain valid)

    const formatDate = (timestamp: any) => {
        if (!timestamp) return "-";
        if (timestamp.toDate) return timestamp.toDate().toLocaleDateString();
        return new Date(timestamp.seconds * 1000).toLocaleDateString();
    };

    // Custom render for day to show dots
    const hasLog = (day: Date) => {
        return markedDates.some(d => isSameDay(d, day));
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Calendar Section */}
            <div className="bg-white rounded-xl border shadow-sm p-6 flex flex-col items-center">
                <h3 className="text-xl font-bold mb-6 w-full text-left text-slate-800">피드백 캘린더</h3>
                <style>{`
                    .rdp { 
                        --rdp-cell-size: 44px; 
                        margin: 0; 
                    }
                    .rdp-caption_label { 
                        font-size: 1.1rem; 
                        font-weight: 700; 
                        color: #1e293b;
                    }
                    .rdp-head_cell {
                        font-size: 0.9rem;
                        font-weight: 600;
                        color: #64748b;
                        padding-bottom: 12px;
                    }
                    .rdp-day {
                        font-size: 0.95rem;
                        border-radius: 9999px; /* Circle */
                    }
                    .rdp-day_selected { 
                        background-color: #0f172a; 
                        color: white; 
                        font-weight: bold;
                    }
                    .rdp-day_selected:hover { 
                        background-color: #334155; 
                    }
                    .rdp-button:hover:not([disabled]):not(.rdp-day_selected) { 
                        background-color: #f1f5f9; 
                        color: #0f172a;
                    }
                    .rdp-day_today {
                        border: 2px solid #cbd5e1;
                        font-weight: bold;
                    }
                    /* Weekend Colors */
                    .rdp-day_sunday { color: #ef4444; }
                    .rdp-day_saturday { color: #3b82f6; }
                `}</style>
                <DayPicker
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    onMonthChange={setCurrentMonth}
                    locale={ko}
                    modifiers={{
                        hasLog: hasLog,
                        holiday: (date) => {
                            const month = date.getMonth() + 1;
                            const day = date.getDate();
                            const monthDay = `${month}-${day}`;
                            return ["1-1", "3-1", "5-5", "6-6", "8-15", "10-3", "10-9", "12-25"].includes(monthDay);
                        }
                    }}
                    modifiersClassNames={{
                        hasLog: "font-bold relative after:content-[''] after:absolute after:bottom-1.5 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-green-500 after:rounded-full",
                        holiday: "text-red-500"
                    }}
                    weekStartsOn={0}
                    formatters={{
                        formatCaption: (date, options) => format(date, "yyyy년 MM월", { locale: ko })
                    }}
                    className="p-2"
                />

                {indexLink && (
                    <div className="mt-6 p-4 border rounded-lg bg-yellow-50 text-center w-full">
                        <p className="mb-2 font-bold text-red-600 text-sm">⚠ 인덱스 설정 필요</p>
                        <a
                            href={indexLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-700 transition-colors"
                        >
                            설정하기
                        </a>
                    </div>
                )}
            </div>

            {/* List Section - Table with Subject Column */}
            <div className="bg-white rounded-xl border shadow-sm flex flex-col h-full min-h-[600px]">
                <div className="p-6 border-b bg-slate-50/50 rounded-t-xl">
                    <h3 className="text-lg font-bold text-slate-800">
                        {selectedDate ? format(selectedDate, "M월 d일 피드백 목록") : "날짜를 선택해주세요"}
                    </h3>
                </div>

                {loadingDaily ? (
                    <div className="p-6 text-center text-sm text-muted-foreground flex-1 flex items-center justify-center">
                        <div className="animate-pulse">목록을 불러오는 중...</div>
                    </div>
                ) : dailyLogs.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground flex-1 flex items-center justify-center">
                        {errorMsg ? `오류가 발생했습니다: ${errorMsg}` : "선택한 날짜에 등록된 피드백이 없습니다."}
                    </div>
                ) : (
                    <div className="overflow-auto flex-1 max-h-[600px]">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-100 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 font-semibold w-20">시간</th>
                                    <th className="px-4 py-3 font-semibold w-24">과목</th>
                                    <th className="px-4 py-3 font-semibold w-24">학생</th>
                                    <th className="px-4 py-3 font-semibold">내용</th>
                                    <th className="px-4 py-3 font-semibold w-24">작성자</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {dailyLogs.map((log) => (
                                    <tr
                                        key={log.id}
                                        className="hover:bg-slate-50 cursor-pointer transition-colors group"
                                        onClick={() => setSelectedLog(log)}
                                    >
                                        <td className="px-4 py-3 font-medium text-slate-500 whitespace-nowrap">
                                            {format(log.createdAt.toDate ? log.createdAt.toDate() : new Date(log.createdAt.seconds * 1000), "HH:mm")}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {log.instrument ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                    {log.instrument}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap group-hover:text-blue-600 transition-colors">
                                            {log.studentName || "학생 미상"}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">
                                            {log.feedback || "내용 없음"}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                                            {log.authorName || "선생님"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal/Overlay for Detail View (Same as before) */}
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
