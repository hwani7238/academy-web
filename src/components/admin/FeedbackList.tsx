"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
    Timestamp,
    collectionGroup,
    onSnapshot,
    orderBy,
    query,
    where,
    type FirestoreError,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { DayPicker, type DayButtonProps } from "react-day-picker";
import { format, endOfDay, endOfMonth, isSameDay, startOfDay, startOfMonth } from "date-fns";
import { ko } from "date-fns/locale";
import "react-day-picker/style.css";

interface TimestampLike {
    toDate?: () => Date;
    seconds?: number;
}

type FirestoreDate = Date | TimestampLike | null | undefined;

interface FeedbackLog {
    id: string;
    path: string;
    studentId?: string;
    studentName?: string;
    authorName?: string;
    feedback: string;
    createdAt: FirestoreDate;
    progress?: string;
    mediaUrl?: string;
    mediaType?: string;
    mediaTitle?: string;
    instrument?: string;
    viewed?: boolean;
    firstViewedAt?: FirestoreDate;
    lastViewedAt?: FirestoreDate;
    viewCount?: number;
    textbookImageUrl?: string;
}

const getDateValue = (timestamp: FirestoreDate) => {
    if (!timestamp) return null;
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp.toDate === "function") return timestamp.toDate();
    if (typeof timestamp.seconds === "number") return new Date(timestamp.seconds * 1000);
    return null;
};

const formatDate = (timestamp: FirestoreDate) => {
    const date = getDateValue(timestamp);
    return date ? date.toLocaleDateString("ko-KR") : "-";
};

const formatDateTime = (timestamp: FirestoreDate) => {
    const date = getDateValue(timestamp);
    return date ? date.toLocaleString("ko-KR") : "-";
};

const formatTime = (timestamp: FirestoreDate) => {
    const date = getDateValue(timestamp);
    return date ? format(date, "HH:mm") : "-";
};

const isViewed = (log: Pick<FeedbackLog, "viewCount" | "lastViewedAt" | "viewed">) =>
    Boolean(log.viewed) || (log.viewCount ?? 0) > 0 || Boolean(log.lastViewedAt);

export function FeedbackList() {
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
    const [dailyLogs, setDailyLogs] = useState<FeedbackLog[]>([]);
    const [loadingDaily, setLoadingDaily] = useState(true);
    const [markedDates, setMarkedDates] = useState<Date[]>([]);
    const [selectedLogPath, setSelectedLogPath] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [indexLink, setIndexLink] = useState<string | null>(null);

    const selectedLog = dailyLogs.find((log) => log.path === selectedLogPath) ?? null;

    useEffect(() => {
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(currentMonth);

        const monthlyQuery = query(
            collectionGroup(db, "logs"),
            where("createdAt", ">=", Timestamp.fromDate(start)),
            where("createdAt", "<=", Timestamp.fromDate(end)),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(
            monthlyQuery,
            (snapshot) => {
                const dates = snapshot.docs
                    .map((docSnapshot) => getDateValue(docSnapshot.data().createdAt))
                    .filter((date): date is Date => date instanceof Date);

                const uniqueDates = dates.filter(
                    (date, index, allDates) => allDates.findIndex((item) => isSameDay(item, date)) === index
                );

                setMarkedDates(uniqueDates);
                setIndexLink(null);
            },
            (error: FirestoreError) => {
                console.error("Error fetching monthly logs:", error);
                if (error.message.includes("indexes")) {
                    const link = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/)?.[0];
                    if (link) {
                        setIndexLink(link);
                    }
                }
            }
        );

        return () => unsubscribe();
    }, [currentMonth]);

    useEffect(() => {
        const start = startOfDay(selectedDate);
        const end = endOfDay(selectedDate);

        const dailyQuery = query(
            collectionGroup(db, "logs"),
            where("createdAt", ">=", Timestamp.fromDate(start)),
            where("createdAt", "<=", Timestamp.fromDate(end)),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(
            dailyQuery,
            (snapshot) => {
                const logs = snapshot.docs.map((docSnapshot) => {
                    const data = docSnapshot.data();

                    return {
                        id: docSnapshot.id,
                        path: docSnapshot.ref.path,
                        studentId: docSnapshot.ref.parent.parent?.id,
                        ...data,
                    } as FeedbackLog;
                });

                setDailyLogs(logs);
                setLoadingDaily(false);
                setErrorMsg(null);
            },
            (error: FirestoreError) => {
                console.error("Error fetching daily logs:", error);
                setDailyLogs([]);
                setLoadingDaily(false);
                setSelectedLogPath(null);
                setErrorMsg("데이터를 불러오는데 실패했습니다.");
            }
        );

        return () => unsubscribe();
    }, [selectedDate]);

    const handleDateSelect = (date?: Date) => {
        if (!date) return;
        setSelectedDate(date);
        setLoadingDaily(true);
        setErrorMsg(null);
        setSelectedLogPath(null);
    };

    const hasLog = (day: Date) => markedDates.some((date) => isSameDay(date, day));

    const renderViewBadge = (log: FeedbackLog) => {
        if (isViewed(log)) {
            return (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    확인 {log.viewCount ?? 1}회
                </span>
            );
        }

        return (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                미확인
            </span>
        );
    };

    return (
        <div className="grid grid-cols-1 gap-6 items-start lg:grid-cols-2">
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
                .rdp-selected .rdp-day_button {
                    background-color: #f43f5e !important;
                    color: white !important;
                    border-color: #f43f5e !important;
                }
                .rdp-day_button:hover {
                    background-color: #f1f5f9 !important;
                    border-radius: 100%;
                }
                .rdp-selected .rdp-day_button:hover {
                    background-color: #e11d48 !important;
                }
                .rdp-weekdays .rdp-weekday:first-child {
                    color: #dc2626 !important;
                }
                .rdp-weekdays .rdp-weekday:last-child {
                    color: #2563eb !important;
                }
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
                .rdp-selected .rdp-day_button {
                    color: white !important;
                }
                .rdp-today:not(.rdp-outside) .rdp-day_button {
                    color: #f43f5e !important;
                    font-weight: bold;
                }
                .rdp-today.rdp-selected .rdp-day_button {
                    color: white !important;
                }
                .rdp-month_caption {
                    font-size: 1.125rem !important;
                    font-weight: 700 !important;
                    color: #1e293b !important;
                    justify-content: center !important;
                    padding-bottom: 0.75rem !important;
                }
                .rdp-weekday {
                    color: #9ca3af !important;
                    font-size: 0.8rem !important;
                    font-weight: 500 !important;
                }
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

            <div className="flex h-[600px] w-full flex-col rounded-xl bg-white p-6 shadow-sm">
                <div className="flex flex-1 flex-col items-center justify-center">
                    <DayPicker
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleDateSelect}
                        onMonthChange={setCurrentMonth}
                        locale={ko}
                        month={currentMonth}
                        modifiers={{ hasLog }}
                        components={{
                            DayButton: (props: DayButtonProps) => {
                                const { day, ...buttonProps } = props;
                                const hasLogForDay = hasLog(day.date);

                                return (
                                    <button {...buttonProps} style={{ position: "relative" }}>
                                        {day.date.getDate()}
                                        {hasLogForDay && <span className="log-dot" />}
                                    </button>
                                );
                            },
                        }}
                        showOutsideDays
                        className="rounded-2xl border bg-white p-4 shadow-sm"
                    />
                </div>

                {indexLink && (
                    <div className="mt-4 w-full rounded-lg border bg-amber-50 p-4 text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <p className="mb-2 flex items-center justify-center gap-2 text-sm font-bold text-amber-800">
                            <span>⚠</span> 데이터베이스 설정이 필요합니다
                        </p>
                        <p className="mb-3 text-xs text-amber-600">
                            전체 학생의 피드백을 날짜별로 모아보려면
                            <br />
                            Firebase 콘솔에서 인덱스를 추가해야 합니다.
                        </p>
                        <a
                            href={indexLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-md bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-amber-700"
                        >
                            자동 설정 링크 열기 &rarr;
                        </a>
                    </div>
                )}
            </div>

            <div className="flex h-full min-h-[600px] flex-col rounded-xl border bg-white shadow-sm">
                <div className="rounded-t-xl border-b bg-slate-50/50 p-6">
                    <h3 className="text-lg font-bold text-slate-800">
                        {format(selectedDate, "M월 d일 피드백 목록")}
                    </h3>
                </div>

                {loadingDaily ? (
                    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                        <div className="animate-pulse">목록을 불러오는 중...</div>
                    </div>
                ) : dailyLogs.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                        {errorMsg ? `오류가 발생했습니다: ${errorMsg}` : "선택한 날짜에 등록된 피드백이 없습니다."}
                    </div>
                ) : (
                    <div className="max-h-[600px] flex-1 overflow-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase text-slate-500">
                                <tr>
                                    <th className="w-20 px-4 py-3 font-semibold">시간</th>
                                    <th className="w-24 px-4 py-3 font-semibold">과목</th>
                                    <th className="w-24 px-4 py-3 font-semibold">학생</th>
                                    <th className="w-28 px-4 py-3 font-semibold">확인</th>
                                    <th className="px-4 py-3 font-semibold">내용</th>
                                    <th className="w-24 px-4 py-3 font-semibold">작성자</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {dailyLogs.map((log) => (
                                    <tr
                                        key={log.path}
                                        className="group cursor-pointer transition-colors hover:bg-slate-50"
                                        onClick={() => setSelectedLogPath(log.path)}
                                    >
                                        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-500">
                                            {formatTime(log.createdAt)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3">
                                            {log.instrument ? (
                                                <span className="inline-flex items-center rounded border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                                                    {log.instrument}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-slate-400">-</span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 transition-colors group-hover:text-blue-600">
                                            {log.studentName || "학생 미상"}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3">
                                            {renderViewBadge(log)}
                                        </td>
                                        <td className="max-w-[200px] px-4 py-3 text-slate-600 truncate">
                                            {log.feedback || "내용 없음"}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                                            {log.authorName || "선생님"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {selectedLog && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => setSelectedLogPath(null)}
                >
                    <div
                        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-lg"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="space-y-4 p-6">
                            <div className="flex items-start justify-between border-b pb-4">
                                <div>
                                    <h3 className="text-xl font-bold">{selectedLog.studentName} 학생 피드백</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        작성자: {selectedLog.authorName || "선생님"} | 작성일: {formatDate(selectedLog.createdAt)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedLogPath(null)}>
                                        &times; 닫기
                                    </Button>
                                </div>
                            </div>

                            <div
                                className={`rounded-lg border-2 p-4 ${isViewed(selectedLog)
                                    ? "border-emerald-200 bg-emerald-50"
                                    : "border-amber-200 bg-amber-50"
                                    }`}
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold text-slate-600">학부모 확인 상태</p>
                                        <div className="mt-2">{renderViewBadge(selectedLog)}</div>
                                    </div>
                                    {isViewed(selectedLog) && (
                                        <p className="text-sm font-medium text-emerald-700">
                                            마지막 확인: {formatDateTime(selectedLog.lastViewedAt)}
                                        </p>
                                    )}
                                </div>
                                <div className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                                    <div className="rounded-md bg-white p-3">
                                        <span className="block text-xs font-medium text-slate-500">최초 확인</span>
                                        <p className="mt-1 font-medium">{formatDateTime(selectedLog.firstViewedAt)}</p>
                                    </div>
                                    <div className="rounded-md bg-white p-3">
                                        <span className="block text-xs font-medium text-slate-500">총 확인 횟수</span>
                                        <p className="mt-1 font-medium">{isViewed(selectedLog) ? `${selectedLog.viewCount ?? 1}회` : "0회"}</p>
                                    </div>
                                </div>
                                {!isViewed(selectedLog) && (
                                    <p className="mt-3 text-xs font-medium text-amber-700">
                                        학부모가 리포트 링크를 열면 여기 상태가 바로 업데이트됩니다.
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <div className="rounded-md bg-slate-50 p-3">
                                    <span className="mb-1 block text-xs font-medium text-slate-500">현재 진도</span>
                                    <p className="text-sm font-medium">{selectedLog.progress || "-"}</p>
                                    {selectedLog.textbookImageUrl && (
                                        <div className="mt-3">
                                            <img
                                                src={selectedLog.textbookImageUrl}
                                                alt="교재 사진"
                                                className="w-full rounded border bg-white object-contain"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="min-h-[100px] rounded-md border p-4">
                                <span className="mb-2 block text-xs font-medium text-slate-500">피드백 내용</span>
                                <p className="whitespace-pre-wrap leading-relaxed">{selectedLog.feedback}</p>
                            </div>

                            {selectedLog.mediaUrl && (
                                <div className="space-y-2">
                                    <span className="text-xs font-medium text-slate-500">첨부 미디어</span>
                                    <div className="flex justify-center overflow-hidden rounded-md bg-black">
                                        {selectedLog.mediaType === "image" ? (
                                            <Image
                                                src={selectedLog.mediaUrl}
                                                alt={selectedLog.mediaTitle || "Feedback Media"}
                                                width={1200}
                                                height={900}
                                                className="max-h-[300px] w-auto object-contain"
                                                unoptimized
                                            />
                                        ) : (
                                            <video src={selectedLog.mediaUrl} controls className="max-h-[300px]" />
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end pt-4">
                                <Button onClick={() => setSelectedLogPath(null)}>닫기</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
