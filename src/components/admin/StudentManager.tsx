"use client";

import { useEffect, useState } from "react";
import { collection, addDoc, getDocs, deleteDoc, doc, onSnapshot, query, orderBy, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { StudentDetail } from "./StudentDetail";
import { INSTRUMENTS, ADMIN_ROLES } from "@/lib/constants";

interface Student {
    id: string;
    name: string;
    phone: string;
    instrument: string;
    status: string;
    progress?: string;
    level?: string;
    feedback?: string;
    createdAt: any;
}

interface StudentManagerProps {
    currentUser: any;
}

export function StudentManager({ currentUser }: StudentManagerProps) {
    const [students, setStudents] = useState<Student[]>([]);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [instrument, setInstrument] = useState<string>(INSTRUMENTS[0]);
    const [loading, setLoading] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editInstrument, setEditInstrument] = useState("");

    useEffect(() => {
        const q = query(collection(db, "students"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const studentsData: Student[] = [];
            querySnapshot.forEach((doc) => {
                studentsData.push({ id: doc.id, ...doc.data() } as Student);
            });
            setStudents(studentsData);
        });

        return () => unsubscribe();
    }, []);

    const handleAddStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !phone) return;

        setLoading(true);
        try {
            await addDoc(collection(db, "students"), {
                name,
                phone,
                instrument,
                status: "등록",
                createdAt: new Date(),
            });
            // Reset form
            setName("");
            setPhone("");
            setInstrument(INSTRUMENTS[0]);
        } catch (error) {
            console.error("Error adding student: ", error);
            alert("학생 등록 실패");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("정말 삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(db, "students", id));
        } catch (error) {
            console.error("Error deleting student: ", error);
            alert("삭제 실패");
        }
    };

    const startEdit = (e: React.MouseEvent, student: Student) => {
        e.stopPropagation();
        setEditingId(student.id);
        setEditName(student.name);
        setEditPhone(student.phone);
        setEditInstrument(student.instrument || INSTRUMENTS[0]);
    };

    const cancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(null);
    };

    const saveEdit = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        try {
            await updateDoc(doc(db, "students", id), {
                name: editName,
                phone: editPhone,
                instrument: editInstrument
            });
            setEditingId(null);
        } catch (error) {
            console.error("Error updating student:", error);
            alert("수정 실패");
        }
    };

    if (selectedStudent) {
        return <StudentDetail student={selectedStudent} currentUser={currentUser} onBack={() => setSelectedStudent(null)} />;
    }

    return (
        <div className="grid gap-8 md:grid-cols-2">
            {/* Student Registration Form */}
            <div className="rounded-lg border p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold">학생 등록</h3>
                <form onSubmit={handleAddStudent} className="space-y-4">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium">이름</label>
                        <input
                            type="text"
                            className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="홍길동"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <label className="text-sm font-medium">연락처</label>
                        <input
                            type="text"
                            className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="010-1234-5678"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <label className="text-sm font-medium">수강 악기</label>
                        <select
                            className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                            value={instrument}
                            onChange={(e) => setInstrument(e.target.value)}
                        >
                            {INSTRUMENTS.map((inst) => (
                                <option key={inst} value={inst}>{inst}</option>
                            ))}
                        </select>
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "등록 중..." : "등록하기"}
                    </Button>
                </form>
            </div>

            {/* Student List */}
            <div className="rounded-lg border p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold">학생 목록 ({students.length}명)</h3>
                <div className="max-h-[500px] overflow-y-auto">
                    {students.length === 0 ? (
                        <p className="text-sm text-muted-foreground">등록된 학생이 없습니다.</p>
                    ) : (
                        <ul className="space-y-3">
                            {students
                                .filter((student) => {
                                    // 1. If admin role, show all
                                    if (currentUser?.role && ADMIN_ROLES.includes(currentUser.role)) {
                                        return true;
                                    }

                                    // 2. If teacher, check subject
                                    if (currentUser?.role === 'teacher') {
                                        const teacherSubject = currentUser.subject;
                                        if (!teacherSubject) return false; // Should not happen if registered correctly

                                        if (teacherSubject === '피아노') {
                                            return student.instrument === '어린이 피아노 취미' || student.instrument === '성인 피아노 취미';
                                        }
                                        return student.instrument === teacherSubject;
                                    }

                                    // Default fallback (e.g. unknown role) -> show none or all? 
                                    // Safer to show none or just matching id if there's filtering logic later
                                    return false;
                                })
                                .map((student) => (
                                    <li key={student.id}
                                        className="flex items-center justify-between rounded-md border p-3 cursor-pointer hover:bg-slate-50 transition-colors"
                                        onClick={() => !editingId && setSelectedStudent(student)}
                                    >
                                        {editingId === student.id ? (
                                            <div className="flex-1 grid gap-2 sm:grid-cols-3 mr-2 items-center" onClick={(e) => e.stopPropagation()}>
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
                                                    value={editInstrument}
                                                    onChange={e => setEditInstrument(e.target.value)}
                                                >
                                                    {INSTRUMENTS.map((inst) => (
                                                        <option key={inst} value={inst}>{inst}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ) : (
                                            <div>
                                                <p className="font-medium">{student.name} <span className="text-xs text-muted-foreground">({student.instrument})</span></p>
                                                <p className="text-sm text-muted-foreground">{student.phone}</p>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-1">
                                            {editingId === student.id ? (
                                                <>
                                                    <Button variant="ghost" size="sm" onClick={(e) => saveEdit(e, student.id)} className="text-green-600 font-medium">
                                                        저장
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={cancelEdit} className="text-slate-500 font-medium">
                                                        취소
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Button variant="ghost" size="sm" onClick={(e) => startEdit(e, student)} className="text-blue-500 font-medium h-8">
                                                        수정
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDelete(student.id);
                                                    }} className="text-red-500 font-medium h-8">
                                                        삭제
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </li>
                                ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
