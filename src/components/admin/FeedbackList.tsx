"use client";

import { useEffect, useState } from "react";
import { collectionGroup, query, orderBy, onSnapshot, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { DayPicker } from "react-day-picker";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import { ko } from "date-fns/locale";
import "react-day-picker/style.css";

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

    // Monthly logs fetching for calendar markers
    useEffect(() => {
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(currentMonth);

        const q = query(
            collectionGroup(db, "logs"),
            where("createdAt", ">=", Timestamp.fromDate(start)),
            where("createdAt", "<=", Timestamp.fromDate(end)),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const dates = snapshot.docs.map(doc => {
                const data = doc.data();
                return data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt.seconds * 1000);
            });
            // Remove duplicates
            const uniqueDates = dates.filter((date, i, self) =>
                self.findIndex(d => isSameDay(d, date)) === i
            );
            setMarkedDates(uniqueDates);
            setIndexLink(null);
        }, (error) => {
            console.error("Error fetching monthly logs:", error);
            if (error.message.includes("indexes")) {
                const link = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/)?.[0];
                if (link) setIndexLink(link);
            }
        });

        return () => unsubscribe();
    }, [currentMonth]);

    // Daily logs fetching
    useEffect(() => {
        if (!selectedDate) return;

        setLoadingDaily(true);
        setErrorMsg(null);

        const start = startOfDay(selectedDate);
        const end = endOfDay(selectedDate);

        const q = query(
            collectionGroup(db, "logs"),
            where("createdAt", ">=", Timestamp.fromDate(start)),
            where("createdAt", "<=", Timestamp.fromDate(end)),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logs: FeedbackLog[] = [];
            snapshot.forEach((doc) => {
                logs.push({ id: doc.id, ...doc.data() } as FeedbackLog);
            });
            setDailyLogs(logs);
            setLoadingDaily(false);
        }, (error) => {
            console.error("Error fetching daily logs:", error);
            setErrorMsg("데이터를 불러오는데 실패했습니다.");
            setLoadingDaily(false);
        });

        return () => unsubscribe();
    }, [selectedDate]);

    // Format date helper
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
            <style>{`
                .rdp-root {
                    --rdp-accent-color: #f43f5e !important;
                    --rdp-accent-background-color: #fff1f2 !important;
                    --rdp-today-color: #f43f5e !important;
                    --rdp-day-height: 40px !important;
                    --rdp-day-width: 40px !important;
                    --rdp-day_button-height: 38px !important;
                    --rdp-day_button-width: 38px !important;
                    --rdp-selected-border: 2px solid #f43f5e !important;
                    margin: 0 !important;
                }
                /* Selected day: rose background */
                .rdp-selected .rdp-day_button {
                    background-color: #f43f5e !important;
                    color: white !important;
                    border-color: #f43f5e !important;
                }
                /* Hover on day button */
                .rdp-day_button:hover {
                    background-color: #f1f5f9 !important;
                    border-radius: 100%;
                }
                .rdp-selected .rdp-day_button:hover {
                    background-color: #e11d48 !important;
                }
                /* Weekday header: Sunday red, Saturday blue */
                .rdp-weekdays .rdp-weekday:first-child {
                    color: #dc2626 !important;
                }
                .rdp-weekdays .rdp-weekday:last-child {
                    color: #2563eb !important;
                }
                /* Day cells: Sunday column red, Saturday column blue */
                .rdp-week > .rdp-day:first-child .rdp-day_button {
                    color: #dc2626;
                }
                .rdp-week > .rdp-day:last-child .rdp-day_button {
                    color: #2563eb;
                }
                .rdp-outside .rdp-day_button {
                    color: #d1d5db !important;
                    opacity: 0.5;
                }
                /* Selected overrides weekend colors */
                .rdp-selected .rdp-day_button {
                    color: white !important;
                }
                /* Today styling */
                .rdp-today:not(.rdp-outside) .rdp-day_button {
                    color: #f43f5e !important;
                    font-weight: bold;
                }
                .rdp-today.rdp-selected .rdp-day_button {
                    color: white !important;
                }
                /* Month caption styling */
                .rdp-month_caption {
                    font-size: 1.125rem !important;
                    font-weight: 700 !important;
                    color: #1e293b !important;
                    justify-content: center !important;
                    padding-bottom: 0.75rem !important;
                }
                /* Weekday header styling */
                .rdp-weekday {
                    color: #9ca3af !important;
                    font-size: 0.8rem !important;
                    font-weight: 500 !important;
                }
                /* Log dot indicator */
                .log-dot {
                    position: absolute;
                    bottom: 2px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 4px;
                    height: 4px;
                    border-radius: 100%;
                    background-color: #f43f5e;
                }
                .rdp-selected .log-dot {
                    background-color: white;
                }
            `}</style>
            {/* Calendar Section */}
            <div className="bg-white rounded-xl shadow-sm p-6 flex flex-col w-full h-[600px]">
                <div className="flex-1 flex flex-col items-center justify-center">
                    <DayPicker
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        onMonthChange={setCurrentMonth}
                        locale={ko}
                        month={currentMonth}
                        modifiers={{
                            hasLog: hasLog,
                        }}
                        components={{
                            DayButton: (props: any) => {
                                const { day, modifiers, ...buttonProps } = props;
                                const date = day.date;
                                const hasLogForDay = hasLog(date);

                                return (
                                    <button {...buttonProps} style={{ position: 'relative' }}>
                                        {date.getDate()}
                                        {hasLogForDay && (
                                            <span className="log-dot" />
                                        )}
                                    </button>
                                );
                            }
                        }}
                        showOutsideDays
                        className="p-4 bg-white rounded-2xl border shadow-sm"
                    />
                </div>

                {indexLink && (
                    <div className="mt-4 p-4 border rounded-lg bg-amber-50 text-center w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <p className="mb-2 font-bold text-amber-800 text-sm flex items-center justify-center gap-2">
                            <span>⚠</span> 데이터베이스 설정이 필요합니다
                        </p>
                        <p className="text-xs text-amber-600 mb-3">
                            전체 학생의 피드백을 날짜별로 모아보려면<br />
                            Firebase 콘솔에서 인덱스를 추가해야 합니다.
                        </p>
                        <a
                            href={indexLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-bold hover:bg-amber-700 transition-colors shadow-sm"
                        >
                            자동 설정 링크 열기 &rarr;
                        </a>
                    </div>
                )}
            </div>



            {/* List Section - Table with Subject Column */}
            <div className="bg-white rounded-xl border shadow-sm flex flex-col h-full min-h-[600px]">
                <div className="p-6 border-b bg-slate-50/50 rounded-t-xl">
                    <h3 className="text-lg font-bold text-slate-800">
                        {selectedDate ? format(selectedDate!, "M월 d일 피드백 목록") : "날짜를 선택해주세요"}
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
            {
                selectedLog && (
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
                )
            }
        </div >
    );
}
