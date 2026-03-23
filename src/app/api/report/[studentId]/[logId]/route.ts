import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface RouteContext {
  params: Promise<{
    studentId: string;
    logId: string;
  }>;
}

const pickPublicLog = (data: FirebaseFirestore.DocumentData) => ({
  studentName: data.studentName ?? "학생",
  progress: data.progress ?? "",
  feedback: data.feedback ?? "",
  createdAt: data.createdAt ?? null,
  mediaUrl: data.mediaUrl ?? null,
  mediaType: data.mediaType ?? null,
  mediaTitle: data.mediaTitle ?? null,
  textbookImageUrl: data.textbookImageUrl ?? null,
  additionalTextbookImageUrl: data.additionalTextbookImageUrl ?? null,
  textbookImages: Array.isArray(data.textbookImages) ? data.textbookImages : [],
  mediaFiles: Array.isArray(data.mediaFiles) ? data.mediaFiles : [],
});

export async function GET(request: Request, context: RouteContext) {
  if (!adminDb) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { studentId, logId } = await context.params;
  const token = new URL(request.url).searchParams.get("t");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  const ref = adminDb.doc(`students/${studentId}/logs/${logId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = snap.data();
  if (!data || data.reportToken !== token) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, report: pickPublicLog(data) });
}

export async function POST(request: Request, context: RouteContext) {
  if (!adminDb) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { studentId, logId } = await context.params;
  const token = new URL(request.url).searchParams.get("t");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  const ref = adminDb.doc(`students/${studentId}/logs/${logId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = snap.data();
  if (!data || data.reportToken !== token) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? "unknown";
  const currentViewCount = typeof data.viewCount === "number" ? data.viewCount : 0;

  const updates: Record<string, unknown> = {
    viewed: true,
    lastViewedAt: FieldValue.serverTimestamp(),
    lastViewedUserAgent: userAgent,
    viewCount: currentViewCount + 1,
  };

  if (!data.firstViewedAt) {
    updates.firstViewedAt = FieldValue.serverTimestamp();
  }

  await ref.update(updates);

  return NextResponse.json({ ok: true });
}
