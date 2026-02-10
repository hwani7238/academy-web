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
}

export function FeedbackList() {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

    // Logs for the selected date (List view)
    const [dailyLogs, setDailyLogs] = useState<FeedbackLog[]>([]);
    const [loadingDaily, setLoadingDaily] = useState(false);

    // Dates that have logs in the current month (Calendar markers)
    const [markedDates, setMarkedDates] = useState<Date[]>([]);

    const [selectedLog, setSelectedLog] = useState<FeedbackLog | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [indexLink, setIndexLink] = useState<string | null>(null);

    // 1. Fetch dates with logs for the current month (to show dots)
    useEffect(() => {
        const fetchMonthlyMarkers = async () => {
            if (!currentMonth) return;

            const start = startOfMonth(currentMonth);
            const end = endOfMonth(currentMonth);

            try {
                // Note: collectionGroup requires an index for range queries on createdAt
                // If it fails, we catch it and might need to suggest index creation
                const q = query(
                    collectionGroup(db, "logs"),
                    where("createdAt", ">=", start),
                    where("createdAt", "<=", end)
                );

                const snapshot = await getDocs(q);
                const dates: Date[] = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    if (data.createdAt && data.createdAt.toDate) {
                        dates.push(data.createdAt.toDate());
                    } else if (data.createdAt && data.createdAt.seconds) {
                        dates.push(new Date(data.createdAt.seconds * 1000));
                    }
                });
                setMarkedDates(dates);
            } catch (error: any) {
                console.error("Error fetching monthly markers:", error);
                // Silent fail for markers or handle index error if critical
                if (error.message.includes("https://console.firebase.google.com")) {
                    const match = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
                    if (match) setIndexLink(match[0]);
                }
            }
        };

        fetchMonthlyMarkers();
    }, [currentMonth]);

    // 2. Fetch logs for the selected date
    useEffect(() => {
        if (!selectedDate) {
            setDailyLogs([]);
            return;
        }

        setLoadingDaily(true);
        setErrorMsg(null);

        const start = startOfDay(selectedDate);
        const end = endOfDay(selectedDate);

        const q = query(
            collectionGroup(db, "logs"),
            where("createdAt", ">=", start),
            where("createdAt", "<=", end),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedLogs: FeedbackLog[] = [];
            snapshot.forEach((doc) => {
                fetchedLogs.push({ id: doc.id, ...doc.data() } as FeedbackLog);
            });
            setDailyLogs(fetchedLogs);
            setLoadingDaily(false);
        }, (error) => {
            console.error("Error fetching daily logs:", error);
            setLoadingDaily(false);
            setErrorMsg(error.message);
            if (error.message.includes("https://console.firebase.google.com")) {
                const match = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
                if (match) setIndexLink(match[0]);
            }
        });

        return () => unsubscribe();
    }, [selectedDate]);

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
            <div className="bg-white rounded-lg border shadow-sm p-6 flex flex-col items-center">
                <h3 className="text-lg font-semibold mb-4 w-full text-left">피드백 캘린더</h3>
                <style>{`
                    .rdp { --rdp-cell-size: 40px; margin: 0; }
                    .rdp-day_selected { background-color: black; color: white; }
                    .rdp-day_selected:hover { background-color: #333; }
                    .rdp-button:hover:not([disabled]):not(.rdp-day_selected) { background-color: #f3f4f6; }
                `}</style>
                <DayPicker
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    onMonthChange={setCurrentMonth}
                    locale={ko}
                    modifiers={{ hasLog: hasLog }}
                    modifiersClassNames={{
                        hasLog: "font-bold text-blue-600 relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-blue-600 after:rounded-full"
                    }}
                    weekStartsOn={0}
                    formatters={{
                        formatCaption: (date, options) => format(date, "yyyy년 MM월", { locale: ko })
                    }}
                    className="border rounded-md p-4"
                />

                {indexLink && (
                    <div className="mt-4 p-4 border rounded bg-yellow-50 text-center w-full">
                        <p className="mb-2 font-bold text-red-600 text-sm">⚠ 인덱스 설정 필요</p>
                        <a
                            href={indexLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-700"
                        >
                            설정하기
                        </a>
                    </div>
                )}
            </div>

            {/* List Section */}
            <div className="bg-white rounded-lg border shadow-sm flex flex-col h-full min-h-[500px]">
                <div className="p-6 border-b">
                    <h3 className="text-lg font-semibold">
                        {selectedDate ? format(selectedDate, "M월 d일 피드백 목록") : "날짜를 선택해주세요"}
                    </h3>
                </div>

                {loadingDaily ? (
                    <div className="p-6 text-center text-sm text-muted-foreground flex-1">목록을 불러오는 중...</div>
                ) : dailyLogs.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground flex-1 flex items-center justify-center">
                        {errorMsg ? `오류가 발생했습니다: ${errorMsg}` : "선택한 날짜에 등록된 피드백이 없습니다."}
                    </div>
                ) : (
                    <div className="divide-y overflow-y-auto flex-1 max-h-[500px]">
                        {dailyLogs.map((log) => (
                            <div
                                key={log.id}
                                className="p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                                onClick={() => setSelectedLog(log)}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-medium text-slate-900">{log.studentName || "학생 미상"}</span>
                                    <span className="text-xs text-slate-500">{format(log.createdAt.toDate ? log.createdAt.toDate() : new Date(log.createdAt.seconds * 1000), "HH:mm")}</span>
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
