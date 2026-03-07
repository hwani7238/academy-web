"use client";

import { useEffect, useState } from "react";
import { deleteApp, getApp, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db, firebaseConfig } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { TEACHER_SUBJECTS } from "@/lib/constants";

interface TimestampLike {
    toDate?: () => Date;
    seconds?: number;
}

type FirestoreDate = Date | TimestampLike | null | undefined;

interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    status?: string;
    phone?: string;
    subject?: string;
    requestedAt?: FirestoreDate;
    approvedAt?: FirestoreDate;
}

interface ErrorShape {
    message?: string;
}

const getDateValue = (timestamp: FirestoreDate) => {
    if (!timestamp) return null;
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp.toDate === "function") return timestamp.toDate();
    if (typeof timestamp.seconds === "number") return new Date(timestamp.seconds * 1000);
    return null;
};

const formatDateTime = (timestamp: FirestoreDate) => {
    const date = getDateValue(timestamp);
    return date ? date.toLocaleString("ko-KR") : "-";
};

export function TeacherManager() {
    const [teachers, setTeachers] = useState<User[]>([]);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [subject, setSubject] = useState<string>(TEACHER_SUBJECTS[0]);
    const [loading, setLoading] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editSubject, setEditSubject] = useState("");

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
            const users: User[] = [];
            snapshot.forEach((docSnapshot) => {
                users.push({ id: docSnapshot.id, ...docSnapshot.data() } as User);
            });
            setTeachers(users.filter((user) => user.role === "teacher"));
        });

        return () => unsubscribe();
    }, []);

    const pendingTeachers = teachers.filter((teacher) => teacher.status === "pending");
    const approvedTeachers = teachers.filter((teacher) => teacher.status !== "pending" && teacher.status !== "rejected");
    const rejectedTeachers = teachers.filter((teacher) => teacher.status === "rejected");

    const handleCreateTeacher = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);

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

            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                name,
                role: "teacher",
                status: "approved",
                phone,
                subject,
                createdAt: new Date(),
                requestedAt: new Date(),
                approvedAt: new Date(),
            });

            await signOut(secondaryAuth);
            await deleteApp(secondaryApp);

            setEmail("");
            setPassword("");
            setName("");
            setPhone("");
            setSubject(TEACHER_SUBJECTS[0]);
            alert("강사 계정이 생성되었습니다.");
        } catch (error: unknown) {
            console.error("Error creating teacher:", error);
            const message =
                typeof error === "object" && error !== null && "message" in error
                    ? String((error as ErrorShape).message)
                    : "알 수 없는 오류";
            alert("강사 생성 실패: " + message);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (teacher: User) => {
        setActionLoadingId(teacher.id);

        try {
            await updateDoc(doc(db, "users", teacher.id), {
                status: "approved",
                approvedAt: new Date(),
            });
        } catch (error) {
            console.error("Error approving teacher:", error);
            alert("승인 실패");
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleReject = async (teacher: User) => {
        setActionLoadingId(teacher.id);

        try {
            await updateDoc(doc(db, "users", teacher.id), {
                status: "rejected",
            });
        } catch (error) {
            console.error("Error rejecting teacher:", error);
            alert("반려 실패");
        } finally {
            setActionLoadingId(null);
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
                subject: editSubject,
            });
            setEditingId(null);
        } catch (error) {
            console.error("Error updating teacher:", error);
            alert("수정 실패");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("강사 프로필을 삭제하시겠습니까? Auth 계정은 별도로 남을 수 있습니다.")) return;

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

            <form onSubmit={handleCreateTeacher} className="mb-6 space-y-4 border-b pb-6">
                <p className="text-sm font-medium text-slate-700">관리자가 직접 강사 계정 생성</p>
                <div className="grid gap-2">
                    <label className="text-sm font-medium">강사 이름</label>
                    <input
                        className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        placeholder="김선생"
                    />
                </div>
                <div className="grid gap-2">
                    <label className="text-sm font-medium">연락처</label>
                    <input
                        className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="010-0000-0000"
                    />
                </div>
                <div className="grid gap-2">
                    <label className="text-sm font-medium">담당 과목</label>
                    <select
                        className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
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
                <div className="grid gap-2">
                    <label className="text-sm font-medium">이메일 (ID)</label>
                    <input
                        className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        placeholder="teacher@example.com"
                    />
                </div>
                <div className="grid gap-2">
                    <label className="text-sm font-medium">비밀번호</label>
                    <input
                        className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        placeholder="******"
                    />
                </div>
                <Button type="submit" disabled={loading}>
                    {loading ? "생성 중..." : "강사 계정 생성"}
                </Button>
            </form>

            <div className="mb-6 space-y-3 border-b pb-6">
                <div className="flex items-center justify-between">
                    <h4 className="font-medium">승인 대기 신청</h4>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        {pendingTeachers.length}건
                    </span>
                </div>

                {pendingTeachers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">승인 대기 중인 강사 신청이 없습니다.</p>
                ) : (
                    <ul className="space-y-2">
                        {pendingTeachers.map((teacher) => (
                            <li key={teacher.id} className="rounded-lg border bg-amber-50/60 p-4 text-sm">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div className="space-y-1">
                                        <p className="font-semibold text-slate-900">{teacher.name}</p>
                                        <p className="text-slate-600">{teacher.email}</p>
                                        <p className="text-slate-600">
                                            {teacher.subject || "과목 미지정"}
                                            {teacher.phone ? ` · ${teacher.phone}` : ""}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            신청 일시: {formatDateTime(teacher.requestedAt)}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            onClick={() => handleApprove(teacher)}
                                            disabled={actionLoadingId === teacher.id}
                                        >
                                            승인
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleReject(teacher)}
                                            disabled={actionLoadingId === teacher.id}
                                        >
                                            반려
                                        </Button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div>
                <h4 className="mb-2 font-medium">승인된 강사 목록</h4>
                <ul className="space-y-2">
                    {approvedTeachers.map((teacher) => (
                        <li key={teacher.id} className="flex items-center justify-between rounded bg-slate-50 p-3 text-sm">
                            {editingId === teacher.id ? (
                                <div className="mr-2 grid flex-1 items-center gap-2 sm:grid-cols-3">
                                    <input
                                        className="h-8 rounded-md border px-2 text-sm"
                                        value={editName}
                                        onChange={(event) => setEditName(event.target.value)}
                                        placeholder="이름"
                                    />
                                    <input
                                        className="h-8 rounded-md border px-2 text-sm"
                                        value={editPhone}
                                        onChange={(event) => setEditPhone(event.target.value)}
                                        placeholder="연락처"
                                    />
                                    <select
                                        className="h-8 rounded-md border px-2 text-sm"
                                        value={editSubject}
                                        onChange={(event) => setEditSubject(event.target.value)}
                                    >
                                        {TEACHER_SUBJECTS.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <div>
                                    <span className="font-bold">{teacher.name}</span>
                                    <span className="ml-2 text-sm text-slate-600">
                                        ({teacher.subject || "과목 미지정"})
                                    </span>
                                    <span className="ml-2 text-slate-500">
                                        {teacher.phone ? ` ${teacher.phone}` : ""}
                                    </span>
                                    <span className="ml-2 text-xs text-slate-400">{teacher.email}</span>
                                </div>
                            )}

                            <div className="flex items-center gap-1">
                                {editingId === teacher.id ? (
                                    <>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => saveEdit(teacher.id)}
                                            className="font-medium text-green-600"
                                        >
                                            저장
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={cancelEdit}
                                            className="font-medium text-slate-500"
                                        >
                                            취소
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => startEdit(teacher)}
                                            className="h-8 font-medium text-blue-500"
                                        >
                                            수정
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(teacher.id)}
                                            className="h-8 font-medium text-red-500"
                                        >
                                            삭제
                                        </Button>
                                    </>
                                )}
                            </div>
                        </li>
                    ))}

                    {approvedTeachers.length === 0 && (
                        <p className="text-sm text-muted-foreground">승인된 강사가 없습니다.</p>
                    )}
                </ul>
            </div>

            {rejectedTeachers.length > 0 && (
                <div className="mt-6 border-t pt-6">
                    <h4 className="mb-2 font-medium">반려된 신청</h4>
                    <ul className="space-y-2">
                        {rejectedTeachers.map((teacher) => (
                            <li key={teacher.id} className="rounded bg-rose-50 p-3 text-sm text-rose-700">
                                {teacher.name} · {teacher.email}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
