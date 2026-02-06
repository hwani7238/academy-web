"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { StudentManager } from "@/components/admin/StudentManager";
import { TeacherManager } from "@/components/admin/TeacherManager";

export default function AdminPage() {
    const [user, setUser] = useState<any>(null);
    const [userData, setUserData] = useState<any>(null);
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
                        setUserData(userDoc.data());
                    } else {
                        // Legacy admin handling or just assume admin
                        setUserData({ role: 'admin', name: '관리자' });
                    }
                } catch (e) {
                    console.error("Error fetching user data", e);
                    setUserData({ role: 'admin', name: '관리자' });
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

    const isTeacher = userData?.role === 'teacher';

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
                    {!isTeacher && !isDetailView && (
                        <section>
                            <h2 className="mb-4 text-2xl font-bold">강사 관리</h2>
                            <TeacherManager />
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
