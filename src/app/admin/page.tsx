"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { StudentManager } from "@/components/admin/StudentManager";
import { TeacherManager } from "@/components/admin/TeacherManager";
import { FeedbackList } from "@/components/admin/FeedbackList";
import { ADMIN_ROLES } from "@/lib/constants";

interface UserProfile {
    role?: string;
    status?: string;
    name?: string;
}

export default function AdminPage() {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [userData, setUserData] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isDetailView, setIsDetailView] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                router.push("/login"); // 로그인 안되어있으면 로그인 페이지로
            } else {
                setUser(currentUser);
                // Fetch user data (role, name)
                try {
                    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
                    if (userDoc.exists()) {
                        setUserData(userDoc.data() as UserProfile);
                    } else {
                        router.push("/setup-admin");
                        return;
                    }
                } catch (e) {
                    console.error("Error fetching user data", e);
                    alert("사용자 정보를 불러오는 중 오류가 발생했습니다.");
                    await signOut(auth);
                    router.push("/login"); // Secure fail state
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [router]);

    const handleLogout = async () => {
        await signOut(auth);
        router.push("/login");
    };

    if (loading) {
        return <div className="flex h-screen items-center justify-center">Loading...</div>;
    }

    if (!user) {
        return null; // 리다이렉트 중
    }

    const isTeacher = userData?.role === "teacher";
    const isApprovedTeacher = isTeacher && (userData?.status ?? "approved") === "approved";
    const isPendingTeacher = isTeacher && userData?.status === "pending";
    const isRejectedTeacher = isTeacher && userData?.status === "rejected";
    const isAdmin = typeof userData?.role === "string" && ADMIN_ROLES.includes(userData.role);

    if (isPendingTeacher) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
                <div className="w-full max-w-md rounded-xl border bg-white p-8 shadow-sm">
                    <h1 className="text-2xl font-bold text-slate-900">승인 대기 중</h1>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                        강사 계정 신청이 접수되었습니다. 관리자가 승인하면 이 계정으로 로그인해 바로 사용할 수 있습니다.
                    </p>
                    <div className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                        현재 상태: 승인 대기
                    </div>
                    <div className="mt-6 flex justify-end">
                        <Button variant="outline" onClick={handleLogout}>
                            로그아웃
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (isRejectedTeacher) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
                <div className="w-full max-w-md rounded-xl border bg-white p-8 shadow-sm">
                    <h1 className="text-2xl font-bold text-slate-900">가입 신청 반려됨</h1>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                        현재 강사 계정 신청이 반려된 상태입니다. 관리자에게 다시 승인 요청을 해주세요.
                    </p>
                    <div className="mt-6 rounded-lg bg-rose-50 p-4 text-sm text-rose-700">
                        현재 상태: 반려
                    </div>
                    <div className="mt-6 flex justify-end">
                        <Button variant="outline" onClick={handleLogout}>
                            로그아웃
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (!isAdmin && !isApprovedTeacher) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
                <div className="w-full max-w-md rounded-xl border bg-white p-8 shadow-sm">
                    <h1 className="text-2xl font-bold text-slate-900">접근 권한 없음</h1>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                        이 계정은 아직 관리자 또는 승인된 강사 계정으로 설정되지 않았습니다.
                    </p>
                    <div className="mt-6 flex justify-end">
                        <Button variant="outline" onClick={handleLogout}>
                            로그아웃
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col">
            <header className="flex h-16 items-center justify-between border-b px-6">
                <h1 className="text-xl font-bold">Admin Dashboard</h1>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                        {userData?.name || user.email} ({isTeacher ? '강사' : '관리자'})
                    </span>
                    <Button variant="outline" size="sm" onClick={handleLogout}>
                        로그아웃
                    </Button>
                </div>
            </header>
            <main className="flex-1 p-6">
                <div className="mx-auto max-w-6xl space-y-8">
                    {isAdmin && !isDetailView && (
                        <section>
                            <h2 className="mb-4 text-2xl font-bold">강사 관리</h2>
                            <TeacherManager />
                        </section>
                    )}

                    {isAdmin && !isDetailView && (
                        <section>
                            <FeedbackList />
                        </section>
                    )}

                    <section>
                        {!isDetailView && <h2 className="mb-4 text-2xl font-bold">학생 관리 ({isTeacher ? '피드백 작성' : '전체 관리'})</h2>}
                        {/* We will need to pass userData to StudentManager for attribution */}
                        <StudentManager
                            currentUser={{ uid: user.uid, ...userData }}
                            onViewModeChange={setIsDetailView}
                        />
                    </section>
                </div>
            </main>
        </div>
    );
}
