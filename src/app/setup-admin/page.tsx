"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { TEACHER_SUBJECTS } from "@/lib/constants";

interface UserProfile {
    role?: string;
    status?: string;
}

interface ErrorShape {
    message?: string;
}

export default function SetupAdminPage() {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [subject, setSubject] = useState<string>(TEACHER_SUBJECTS[0]);
    const [status, setStatus] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [existingProfile, setExistingProfile] = useState<UserProfile | null>(null);
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);

            if (!currentUser) {
                setLoading(false);
                return;
            }

            const snap = await getDoc(doc(db, "users", currentUser.uid));
            if (snap.exists()) {
                const data = snap.data() as UserProfile;
                setExistingProfile(data);

                if (data.role === "teacher" && data.status === "pending") {
                    setStatus("강사 계정 신청이 접수되었고 현재 승인 대기 중입니다.");
                } else if (data.role === "teacher" && data.status === "rejected") {
                    setStatus("강사 신청이 반려되었습니다. 관리자에게 문의해주세요.");
                } else {
                    setStatus("이미 계정 정보가 존재합니다.");
                }
            } else {
                setStatus("강사 계정 신청서를 작성해주세요.");
            }

            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleCreateProfile = async () => {
        if (!user) return;

        setSubmitting(true);

        try {
            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                name: name || user.displayName || "강사",
                phone,
                role: "teacher",
                status: "pending",
                subject,
                createdAt: new Date(),
                requestedAt: new Date(),
            });

            router.push("/admin");
        } catch (error: unknown) {
            console.error(error);
            const message =
                typeof error === "object" && error !== null && "message" in error
                    ? String((error as ErrorShape).message)
                    : "알 수 없는 오류";
            alert("신청 실패: " + message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
        router.push("/login");
    };

    if (loading) {
        return <div className="p-8">Loading...</div>;
    }

    if (!user) {
        return (
            <div className="mx-auto max-w-md p-8">
                <h1 className="mb-4 text-2xl font-bold">강사 계정 신청</h1>
                <p className="mb-4">먼저 로그인하거나 신규 강사 계정을 신청해야 합니다.</p>
                <div className="flex gap-2">
                    <Button onClick={() => router.push("/login")}>로그인</Button>
                    <Button variant="outline" onClick={() => router.push("/teacher-signup")}>
                        신규 강사 신청
                    </Button>
                </div>
            </div>
        );
    }

    if (existingProfile) {
        return (
            <div className="mx-auto max-w-md space-y-4 p-8">
                <h1 className="text-2xl font-bold">계정 상태</h1>
                <div className="rounded-lg bg-slate-100 p-4">
                    <p><strong>Email:</strong> {user.email}</p>
                    <p className="mt-2 font-medium text-slate-700">{status}</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => router.push("/admin")}>상태 확인</Button>
                    <Button variant="outline" onClick={handleLogout}>
                        로그아웃
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-md space-y-4 p-8">
            <h1 className="text-2xl font-bold">강사 계정 신청</h1>
            <div className="rounded-lg bg-slate-100 p-4">
                <p><strong>Email:</strong> {user.email}</p>
                <p className="mt-2 text-sm text-slate-600">{status}</p>
            </div>

            <div className="space-y-2">
                <label className="block text-sm font-medium">이름</label>
                <input
                    className="w-full rounded border p-2"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="이름 입력"
                />
            </div>

            <div className="space-y-2">
                <label className="block text-sm font-medium">연락처</label>
                <input
                    className="w-full rounded border p-2"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="010-0000-0000"
                />
            </div>

            <div className="space-y-2">
                <label className="block text-sm font-medium">담당 과목</label>
                <select
                    className="w-full rounded border p-2"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                >
                    {TEACHER_SUBJECTS.map((item) => (
                        <option key={item} value={item}>
                            {item}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex gap-2">
                <Button onClick={handleCreateProfile} disabled={submitting}>
                    {submitting ? "신청 중..." : "강사 가입 신청"}
                </Button>
                <Button variant="outline" onClick={handleLogout}>
                    로그아웃
                </Button>
            </div>
        </div>
    );
}
