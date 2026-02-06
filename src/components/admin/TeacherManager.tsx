"use client";

import { useState, useEffect } from "react";
import { initializeApp, getApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, doc, setDoc, onSnapshot, query, where, deleteDoc, updateDoc } from "firebase/firestore";
import { db, firebaseConfig } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { TEACHER_SUBJECTS } from "@/lib/constants";

interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    phone?: string;
    subject?: string;
}

export function TeacherManager() {
    const [teachers, setTeachers] = useState<User[]>([]);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [subject, setSubject] = useState<string>(TEACHER_SUBJECTS[0]);
    const [loading, setLoading] = useState(false);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editSubject, setEditSubject] = useState("");

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
                phone: phone,
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
            setPhone("");
            setSubject(TEACHER_SUBJECTS[0]);
            alert("강사 계정이 생성되었습니다.");

        } catch (error: any) {
            console.error("Error creating teacher:", error);
            alert("강사 생성 실패: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (teacher: User) => {
        setEditingId(teacher.id);
        setEditName(teacher.name);
        setEditPhone(teacher.phone || "");
        setEditSubject(teacher.subject || TEACHER_SUBJECTS[0]);
    };

    const cancelEdit = () => {
        setEditingId(null);
    };

    const saveEdit = async (id: string) => {
        try {
            await updateDoc(doc(db, "users", id), {
                name: editName,
                phone: editPhone,
                subject: editSubject
            });
            setEditingId(null);
        } catch (error) {
            console.error("Error updating teacher:", error);
            alert("수정 실패");
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
                    <label className="text-sm font-medium">연락처</label>
                    <input className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                        value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000" />
                </div>
                <div className="grid gap-2">
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
                            {editingId === teacher.id ? (
                                <div className="flex-1 grid gap-2 sm:grid-cols-3 mr-2 items-center">
                                    <input
                                        className="h-8 rounded-md border px-2 text-sm"
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        placeholder="이름"
                                    />
                                    <input
                                        className="h-8 rounded-md border px-2 text-sm"
                                        value={editPhone}
                                        onChange={e => setEditPhone(e.target.value)}
                                        placeholder="연락처"
                                    />
                                    <select
                                        className="h-8 rounded-md border px-2 text-sm"
                                        value={editSubject}
                                        onChange={e => setEditSubject(e.target.value)}
                                    >
                                        {TEACHER_SUBJECTS.map((sub) => (
                                            <option key={sub} value={sub}>{sub}</option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <div>
                                    <span className="font-bold">{teacher.name}</span>
                                    <span className="ml-2 text-sm text-slate-600">({teacher.subject || "과목 미지정"})</span>
                                    <span className="ml-2 text-slate-500">{teacher.phone ? ` ${teacher.phone}` : ""}</span>
                                    <span className="ml-2 text-xs text-slate-400">{teacher.email}</span>
                                </div>
                            )}

                            <div className="flex items-center gap-1">
                                {editingId === teacher.id ? (
                                    <>
                                        <Button variant="ghost" size="sm" onClick={() => saveEdit(teacher.id)} className="text-green-600 font-medium">
                                            저장
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={cancelEdit} className="text-slate-500 font-medium">
                                            취소
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button variant="ghost" size="sm" onClick={() => startEdit(teacher)} className="text-blue-500 font-medium h-8">
                                            수정
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleDelete(teacher.id)} className="text-red-500 font-medium h-8">
                                            삭제
                                        </Button>
                                    </>
                                )}
                            </div>
                        </li>
                    ))}
                    {teachers.length === 0 && <p className="text-muted-foreground text-sm">등록된 강사가 없습니다.</p>}
                </ul>
            </div>
        </div>
    );
}
