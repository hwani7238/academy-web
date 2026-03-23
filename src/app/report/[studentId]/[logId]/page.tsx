"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase";

interface TimestampLike {
  toDate?: () => Date;
  seconds?: number;
  _seconds?: number;
}

type FirestoreDate = Date | TimestampLike | null | undefined;

const getDateValue = (timestamp: FirestoreDate) => {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === "function") return timestamp.toDate();
  if (typeof timestamp.seconds === "number") return new Date(timestamp.seconds * 1000);
  if (typeof timestamp._seconds === "number") return new Date(timestamp._seconds * 1000);
  return null;
};

interface PublicReport {
  studentName?: string;
  progress?: string;
  feedback?: string;
  createdAt?: FirestoreDate;
  mediaUrl?: string;
  mediaType?: string;
  mediaTitle?: string;
  textbookImageUrl?: string;
  additionalTextbookImageUrl?: string;
  textbookImages?: { url: string; path: string }[];
  mediaFiles?: { url: string; type: string; path: string; title?: string }[];
}

export default function ReportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const studentId = params?.studentId as string;
  const logId = params?.logId as string;
  const token = searchParams?.get("t") ?? null;

  const [report, setReport] = useState<PublicReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!studentId || !logId || !token) {
        setError(true);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/report/${studentId}/${logId}?t=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch report: ${response.status}`);
        }

        const data = await response.json();
        setReport(data.report ?? null);
      } catch (err) {
        console.error("Error fetching report data:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [studentId, logId, token]);

  useEffect(() => {
    if (!studentId || !logId || !token || !report) return;
    if (typeof window === "undefined") return;

    const sessionKey = `report-view:${studentId}:${logId}`;

    const trackView = async () => {
      if (document.visibilityState !== "visible") return;
      if (window.sessionStorage.getItem(sessionKey)) return;

      const adminView = searchParams?.get("admin") === "true";
      if (adminView || auth.currentUser) {
        return;
      }

      window.sessionStorage.setItem(sessionKey, "pending");

      try {
        const response = await fetch(`/api/report/${studentId}/${logId}?t=${encodeURIComponent(token)}`, {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error(`Failed to track view: ${response.status}`);
        }

        window.sessionStorage.setItem(sessionKey, "done");
      } catch (error) {
        window.sessionStorage.removeItem(sessionKey);
        console.error("Error tracking report view:", error);
      }
    };

    const timeoutId = window.setTimeout(() => {
      void trackView();
    }, 800);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void trackView();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [studentId, logId, token, report, searchParams]);

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (error || !report) return <div className="flex h-screen items-center justify-center">리포트를 찾을 수 없습니다.</div>;

  const date = getDateValue(report.createdAt)?.toLocaleDateString() ?? "-";

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
              <p className="text-lg font-bold">{report.studentName || "학생"}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">작성일</p>
              <p className="font-medium">{date}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-500">현재 진도</h3>
              <p className="text-lg font-medium">{report.progress || "미입력"}</p>
              {(report.textbookImageUrl || report.additionalTextbookImageUrl || (report.textbookImages && report.textbookImages.length > 0)) && (
                <div className="mt-4 flex flex-col gap-2">
                  {report.textbookImageUrl && (
                    <img src={report.textbookImageUrl} alt="교재 사진" className="w-full rounded border bg-white object-contain" />
                  )}
                  {report.additionalTextbookImageUrl && (
                    <img src={report.additionalTextbookImageUrl} alt="추가 교재 사진" className="w-full rounded border bg-white object-contain" />
                  )}
                  {report.textbookImages && report.textbookImages.map((img, idx) => (
                    <img key={idx} src={img.url} alt={`교재 사진 ${idx + 1}`} className="w-full rounded border bg-white object-contain" />
                  ))}
                </div>
              )}
            </div>
          </div>

          <h3 className="mb-3 text-lg font-semibold">선생님 피드백</h3>
          <div className="rounded-lg border bg-white p-4 text-slate-700 leading-relaxed whitespace-pre-wrap">
            {report.feedback}
          </div>
        </div>

        {(report.mediaUrl || (report.mediaFiles && report.mediaFiles.length > 0)) && (
          <div className="px-6 space-y-4">
            <h3 className="text-lg font-semibold -mb-1">첨부 미디어</h3>

            {report.mediaUrl && (
              <div className="rounded-lg border bg-white p-2">
                {report.mediaTitle && <p className="mb-2 font-medium px-1">{report.mediaTitle}</p>}
                {report.mediaType === "image" ? (
                  <img src={report.mediaUrl} alt="첨부 이미지" className="w-full rounded" />
                ) : (
                  <div className="flex flex-col gap-2">
                    <video src={report.mediaUrl} controls className="w-full rounded" />
                    <div className="flex justify-end mt-1">
                      <a href={report.mediaUrl} download target="_blank" rel="noreferrer" className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 px-3 rounded inline-flex items-center gap-1 transition-colors">
                        영상 다운로드
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {report.mediaFiles && report.mediaFiles.map((media, idx) => (
              <div key={idx} className="rounded-lg border bg-white p-2">
                {media.title && <p className="mb-2 font-medium px-1">{media.title}</p>}
                {media.type === "image" ? (
                  <img src={media.url} alt={`첨부 이미지 ${idx + 1}`} className="w-full rounded" />
                ) : (
                  <div className="flex flex-col gap-2">
                    <video src={media.url} controls className="w-full rounded" />
                    <div className="flex justify-end mt-1">
                      <a href={media.url} download target="_blank" rel="noreferrer" className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 px-3 rounded inline-flex items-center gap-1 transition-colors">
                        영상 다운로드
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ))}
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
