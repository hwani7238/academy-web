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
                        modifiersClassNames={{
                            selected: "bg-rose-500 text-white hover:bg-rose-600 font-bold rounded-full",
                            today: "text-rose-500 font-bold",
                            hasLog: "relative",
                            saturday: "text-blue-500",
                            sunday: "text-red-500"
                        }}
                        // @ts-ignore
                        components={({
                            DayContent: (props: any) => {
                                const { date, activeModifiers } = props;
                                const isSelected = activeModifiers.selected;
                                const isToday = activeModifiers.today;
                                const hasLogForDay = hasLog(date);

                                return (
                                    <div className={`relative w-full h-full flex items-center justify-center text-sm
                                        ${isSelected ? 'text-white' : ''}
                                        ${!isSelected && isToday ? '!text-rose-500 font-bold' : ''}
                                        ${!isSelected && !isToday && date.getDay() === 0 ? '!text-red-600 font-medium' : ''}
                                        ${!isSelected && !isToday && date.getDay() === 6 ? '!text-blue-600 font-medium' : ''}
                                    `}>
                                        {date.getDate()}
                                        {hasLogForDay && !isSelected && (
                                            <div className="absolute bottom-1 w-1 h-1 bg-rose-500 rounded-full mx-auto" />
                                        )}
                                        {hasLogForDay && isSelected && (
                                            <div className="absolute bottom-1 w-1 h-1 bg-white rounded-full mx-auto" />
                                        )}
                                    </div>
                                );
                            }
                        } as any)}
                        showOutsideDays
                        className="p-4 bg-white rounded-2xl border shadow-sm"
                        classNames={{
                            months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                            month: "space-y-4 w-full",
                            caption: "flex justify-center pt-1 relative items-center mb-4",
                            caption_label: "text-lg font-bold text-gray-800",
                            nav: "space-x-1 flex items-center",
                            nav_button: "h-8 w-8 bg-transparent hover:bg-gray-100 p-1 rounded-full text-gray-600 transition-colors flex items-center justify-center",
                            nav_button_previous: "absolute left-1",
                            nav_button_next: "absolute right-1",
                            table: "w-full border-collapse",
                            head_row: "[&>th]:!font-normal [&>th:first-child]:!text-red-600 [&>th:last-child]:!text-blue-600",
                            head_cell: "text-gray-400 rounded-md w-10 h-10 font-medium text-[0.8rem]",
                            row: "w-full mt-2",
                            cell: "h-10 w-10 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-gray-100/50 [&:has([aria-selected])]:bg-gray-100 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                            day: "h-10 w-10 p-0 font-normal aria-selected:opacity-100 hover:bg-gray-100 rounded-full transition-colors",
                            day_selected: "bg-rose-500 text-white hover:bg-rose-600 focus:bg-rose-600 focus:text-white",
                            day_today: "text-rose-500 font-bold",
                            day_outside: "text-gray-300 opacity-50",
                            day_disabled: "text-gray-300 opacity-50",
                            day_range_middle: "aria-selected:bg-gray-100 aria-selected:text-gray-900",
                            day_hidden: "invisible",
                        }}
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
