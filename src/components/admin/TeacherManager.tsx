"use client";

import { useState, useEffect } from "react";
import { initializeApp, getApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, doc, setDoc, onSnapshot, query, where, deleteDoc } from "firebase/firestore";
import { db, firebaseConfig } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { TEACHER_SUBJECTS } from "@/lib/constants";

interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    subject?: string;
}

export function TeacherManager() {
    const [teachers, setTeachers] = useState<User[]>([]);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [subject, setSubject] = useState<string>(TEACHER_SUBJECTS[0]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Query users where role is 'teacher' (or list all and filter)
        // Since we might not have set indexes, let's just listen to 'users' collection 
        // We'll need to create the 'users' collection first.
        const q = query(collection(db, "users"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const users: User[] = [];
            snapshot.forEach((doc) => {
                users.push({ id: doc.id, ...doc.data() } as User);
            });
            // Filter client side or update query later
            setTeachers(users.filter(u => u.role === 'teacher'));
        });

        return () => unsubscribe();
    }, []);

    const handleCreateTeacher = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Use a secondary app to create user without logging out the current admin
        const secondaryAppName = "secondaryApp";
        let secondaryApp;
        try {
            try {
                secondaryApp = getApp(secondaryAppName);
            } catch {
                secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
            }

            const secondaryAuth = getAuth(secondaryApp);
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const user = userCredential.user;

            // Create user doc in Firestore
            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                name: name,
                role: "teacher",
                subject: subject,
                createdAt: new Date()
            });

            // Sign out from secondary app to be safe (though it shouldn't affect main auth)
            await signOut(secondaryAuth);

            // Allow the secondary app to be properly cleaned up? 
            // Actually deleteApp is better to free resources.
            await deleteApp(secondaryApp);

            setEmail("");
            setPassword("");
            setName("");
            setSubject(TEACHER_SUBJECTS[0]);
            alert("강사 계정이 생성되었습니다.");

        } catch (error: any) {
            console.error("Error creating teacher:", error);
            alert("강사 생성 실패: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("강사를 삭제하시겠습니까? 계정 삭제는 Firebase Console에서 별도로 해야 합니다.")) return;
        try {
            await deleteDoc(doc(db, "users", id));
        } catch (error) {
            console.error("Error deleting teacher doc:", error);
            alert("삭제 실패");
        }
    };

    return (
        <div className="rounded-lg border p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">강사 관리</h3>

            <form onSubmit={handleCreateTeacher} className="space-y-4 mb-6 border-b pb-6">
                <div className="grid gap-2">
                    <label className="text-sm font-medium">강사 이름</label>
                    <input className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                        value={name} onChange={e => setName(e.target.value)} required placeholder="김선생" />
                </div>
                <div className="grid gap-2">
                    <label className="text-sm font-medium">담당 과목</label>
                    <select
                        className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                    >
                        {TEACHER_SUBJECTS.map((sub) => (
                            <option key={sub} value={sub}>{sub}</option>
                        ))}
                    </select>
                </div>
                <div className="grid gap-2">
                    <label className="text-sm font-medium">이메일 (ID)</label>
                    <input className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                        type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="teacher@example.com" />
                </div>
                <div className="grid gap-2">
                    <label className="text-sm font-medium">비밀번호</label>
                    <input className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                        type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="******" />
                </div>
                <Button type="submit" disabled={loading}>{loading ? "생성 중..." : "강사 계정 생성"}</Button>
            </form>

            <div>
                <h4 className="font-medium mb-2">등록된 강사 목록</h4>
                <ul className="space-y-2">
                    {teachers.map(teacher => (
                        <li key={teacher.id} className="flex justify-between items-center bg-slate-50 p-3 rounded text-sm">
                            <div>
                                <span className="font-bold">{teacher.name}</span>
                                <span className="ml-2 text-sm text-slate-600">({teacher.subject || "과목 미지정"})</span>
                                <span className="ml-2 text-slate-500">{teacher.email}</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(teacher.id)} className="text-red-500">삭제</Button>
                        </li>
                    ))}
                    {teachers.length === 0 && <p className="text-muted-foreground text-sm">등록된 강사가 없습니다.</p>}
                </ul>
            </div>
        </div>
    );
}
