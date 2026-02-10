"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function SetupAdminPage() {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [role, setRole] = useState("admin"); // Default to admin for recovery
    const [status, setStatus] = useState("");
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            setLoading(false);
            if (currentUser) {
                // Check if doc exists
                const snap = await getDoc(doc(db, "users", currentUser.uid));
                if (snap.exists()) {
                    setStatus("이미 계정 정보가 존재합니다.");
                } else {
                    setStatus("계정 정보가 없습니다. 아래 버튼으로 생성하세요.");
                }
            }
        });
        return () => unsubscribe();
    }, []);

    const handleCreateProfile = async () => {
        if (!user) return;
        try {
            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                name: name || user.displayName || "관리자",
                phone: phone,
                role: role,
                createdAt: new Date(),
                subject: role === 'teacher' ? '피아노' : null // Default subject if teacher
            });
            alert("계정 정보가 생성되었습니다. 관리자 페이지로 이동합니다.");
            router.push("/admin");
        } catch (e: any) {
            console.error(e);
            alert("생성 실패: " + e.message);
        }
    };

    if (loading) return <div className="p-8">Loading...</div>;

    if (!user) {
        return (
            <div className="p-8 max-w-md mx-auto">
                <h1 className="text-2xl font-bold mb-4">관리자 계정 복구 도구</h1>
                <p className="mb-4">먼저 로그인이 필요합니다.</p>
                <Button onClick={() => router.push("/login")}>로그인 페이지로 이동</Button>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-md mx-auto space-y-4">
            <h1 className="text-2xl font-bold">계정 정보 복구</h1>
            <div className="p-4 bg-slate-100 rounded">
                <p><strong>UID:</strong> {user.uid}</p>
                <p><strong>Email:</strong> {user.email}</p>
                <p className="font-bold text-red-500 mt-2">{status}</p>
            </div>

            <div className="space-y-2">
                <label className="block text-sm font-medium">이름</label>
                <input
                    className="w-full border p-2 rounded"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="이름 입력"
                />
            </div>

            <div className="space-y-2">
                <label className="block text-sm font-medium">연락처</label>
                <input
                    className="w-full border p-2 rounded"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="010-0000-0000"
                />
            </div>

            <div className="space-y-2">
                <label className="block text-sm font-medium">역할</label>
                <select
                    className="w-full border p-2 rounded"
                    value={role}
                    onChange={e => setRole(e.target.value)}
                >
                    <option value="admin">최고 관리자 (Admin)</option>
                    <option value="teacher">강사 (Teacher)</option>
                </select>
            </div>

            <Button onClick={handleCreateProfile} className="w-full">
                계정 정보 생성하기
            </Button>
        </div>
    );
}
