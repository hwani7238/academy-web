"use client";

import { useEffect, useState } from "react";
import { collection, addDoc, getDocs, deleteDoc, doc, onSnapshot, query, orderBy, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { StudentDetail } from "./StudentDetail";
import { INSTRUMENTS, ADMIN_ROLES } from "@/lib/constants";

export interface Student {
    id: string;
    name: string;
    phone: string;
    instrument?: string; // Legacy support
    instruments?: string[]; // New multi-subject support
    status: string;
    progress?: string;
    level?: string;
    feedback?: string;
    createdAt: any;
}

interface StudentManagerProps {
    currentUser: any;
    onViewModeChange?: (isViewMode: boolean) => void;
}

export function StudentManager({ currentUser, onViewModeChange }: StudentManagerProps) {
    const [students, setStudents] = useState<Student[]>([]);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    // New state for multi-selection
    const [selectedInstruments, setSelectedInstruments] = useState<string[]>([]);

    const [loading, setLoading] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editInstruments, setEditInstruments] = useState<string[]>([]);

    // Filter & Search states
    const [filterInstrument, setFilterInstrument] = useState("전체");
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        let q;
        if (currentUser?.role === 'teacher' && currentUser.subject) {
            // Teacher: Query only students matching their subject
            // Note: Limited querying for array-contains might need index
            // For now, fetch all and filter client-side if complex querying is needed without index
            // Or use array-contains if simple enough.
            // Given the legacy mixed data, let's fetch ordered by date and filter client side for safety & flexibility initially
            // unless dataset is huge.
            q = query(collection(db, "students"), orderBy("createdAt", "desc"));
        } else {
            // Admin: Query all students
            q = query(collection(db, "students"), orderBy("createdAt", "desc"));
        }

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const studentsData: Student[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                // Migration logic on read: ensure instruments array exists
                let instruments = data.instruments || [];
                if (instruments.length === 0 && data.instrument) {
                    instruments = [data.instrument];
                }
                studentsData.push({ id: doc.id, ...data, instruments } as Student);
            });
            setStudents(studentsData);
        }, (error) => {
            console.error("Error fetching students:", error);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const handleInstrumentToggle = (instrument: string) => {
        setSelectedInstruments(prev =>
            prev.includes(instrument)
                ? prev.filter(i => i !== instrument)
                : [...prev, instrument]
        );
    };

    const handleEditInstrumentToggle = (instrument: string) => {
        setEditInstruments(prev =>
            prev.includes(instrument)
                ? prev.filter(i => i !== instrument)
                : [...prev, instrument]
        );
    };

    const handleAddStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !phone) return;
        if (selectedInstruments.length === 0) {
            alert("최소 하나의 악기(과목)를 선택해주세요.");
            return;
        }

        setLoading(true);
        try {
            await addDoc(collection(db, "students"), {
                name,
                phone,
                instruments: selectedInstruments,
                // Keep legitimate legacy field or primary instrument for simple queries if needed, 
                // but moving forward 'instruments' is source of truth.
                instrument: selectedInstruments[0],
                status: "등록",
                createdAt: new Date(),
            });
            // Reset form
            setName("");
            setPhone("");
            setSelectedInstruments([]);
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
        // Ensure we load from array, fallback to single legacy
        const currentInstruments = student.instruments && student.instruments.length > 0
            ? student.instruments
            : (student.instrument ? [student.instrument] : []);
        setEditInstruments(currentInstruments);
    };

    const cancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(null);
    };

    const saveEdit = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (editInstruments.length === 0) {
            alert("최소 하나의 악기(과목)를 선택해야 합니다.");
            return;
        }

        try {
            await updateDoc(doc(db, "students", id), {
                name: editName,
                phone: editPhone,
                instruments: editInstruments,
                instrument: editInstruments[0] // Update legacy field to primary
            });
            setEditingId(null);
        } catch (error) {
            console.error("Error updating student:", error);
            alert("수정 실패");
        }
    };

    if (selectedStudent) {
        return <StudentDetail student={selectedStudent} currentUser={currentUser} onBack={() => {
            setSelectedStudent(null);
            onViewModeChange?.(false);
        }} />;
    }

    const filteredStudents = students.filter((student) => {
        // Normalize student instruments
        const studentInstruments = student.instruments && student.instruments.length > 0
            ? student.instruments
            : (student.instrument ? [student.instrument] : []);

        // 1. Role-based filtering (Teacher)
        if (currentUser?.role === 'teacher') {
            const teacherSubject = currentUser.subject;
            if (!teacherSubject) return false;

            // Special handling for Piano
            if (teacherSubject === '피아노') {
                // Check if student has piano
                if (!studentInstruments.includes('피아노')) return false;
                // If specific filter applies
                if (filterInstrument !== "전체" && !studentInstruments.includes(filterInstrument)) return false;
            } else {
                if (!studentInstruments.includes(teacherSubject)) return false;
            }
        }

        // 2. Admin filtering (Instrument)
        if (filterInstrument !== "전체") {
            if (!studentInstruments.includes(filterInstrument)) return false;
        }

        // 3. Search Query filtering (Name or Phone)
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matchesName = (student.name || "").toLowerCase().includes(query);
            const matchesPhone = (student.phone || "").includes(query);
            if (!matchesName && !matchesPhone) return false;
        }

        return true;
    });

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
                            placeholder="학생 이름"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <label className="text-sm font-medium">연락처</label>
                        <input
                            type="tel"
                            className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="010-0000-0000"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <label className="text-sm font-medium">수강 악기 (다중 선택 가능)</label>
                        <div className="grid grid-cols-2 gap-2 border rounded-md p-3">
                            {INSTRUMENTS.map((inst) => (
                                <div key={inst} className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id={`inst-${inst}`}
                                        checked={selectedInstruments.includes(inst)}
                                        onChange={() => handleInstrumentToggle(inst)}
                                        className="rounded border-gray-300"
                                    />
                                    <label htmlFor={`inst-${inst}`} className="text-sm cursor-pointer select-none">
                                        {inst}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "등록 중..." : "학생 등록"}
                    </Button>
                </form>
            </div>

            {/* Student List */}
            <div className="rounded-lg border p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                    <h3 className="text-lg font-semibold">학생 목록 ({filteredStudents.length}명)</h3>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="이름/번호 검색"
                            className="h-9 w-32 sm:w-40 rounded-md border border-input px-3 text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <select
                            className="h-9 rounded-md border border-input px-3 text-sm"
                            value={filterInstrument}
                            onChange={(e) => setFilterInstrument(e.target.value)}
                        >
                            <option value="전체">전체 보기</option>
                            {INSTRUMENTS.map((inst) => (
                                <option key={inst} value={inst}>{inst}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="max-h-[500px] overflow-y-auto">
                    {filteredStudents.length === 0 ? (
                        <p className="text-sm text-muted-foreground">등록된 학생이 없습니다.</p>
                    ) : (
                        <ul className="space-y-3">
                            {filteredStudents
                                .map((student) => {
                                    const displayInstruments = student.instruments?.join(", ") || student.instrument;

                                    return (
                                        <li key={student.id}
                                            className="flex items-start justify-between rounded-md border p-3 cursor-pointer hover:bg-slate-50 transition-colors"
                                            onClick={() => {
                                                if (!editingId) {
                                                    setSelectedStudent(student);
                                                    onViewModeChange?.(true);
                                                }
                                            }}
                                        >
                                            {editingId === student.id ? (
                                                <div className="flex-1 space-y-3 mr-2 bg-white p-2 rounded border" onClick={(e) => e.stopPropagation()}>
                                                    <div className="grid grid-cols-2 gap-2">
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
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                                        {INSTRUMENTS.map((inst) => (
                                                            <div key={inst} className="flex items-center space-x-1">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editInstruments.includes(inst)}
                                                                    onChange={() => handleEditInstrumentToggle(inst)}
                                                                    className="rounded border-gray-300 h-3 w-3"
                                                                />
                                                                <span className="truncate">{inst}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex-1">
                                                    <p className="font-medium">
                                                        {student.name}
                                                        <span className="ml-2 inline-flex gap-1 flex-wrap">
                                                            {student.instruments && student.instruments.length > 0 ? (
                                                                student.instruments.map(inst => (
                                                                    <span key={inst} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                                        {inst}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                                                    {student.instrument}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </p>
                                                    <p className="text-sm text-muted-foreground mt-0.5">{student.phone}</p>
                                                </div>
                                            )}

                                            <div className="flex items-center gap-1 ml-2 self-start mt-1">
                                                {editingId === student.id ? (
                                                    <div className="flex flex-col gap-1">
                                                        <Button variant="ghost" size="sm" onClick={(e) => saveEdit(e, student.id)} className="text-green-600 font-medium h-7 text-xs border border-green-200 bg-green-50">
                                                            저장
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={cancelEdit} className="text-slate-500 font-medium h-7 text-xs border">
                                                            취소
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="flex gap-1">
                                                        <Button variant="ghost" size="sm" onClick={(e) => startEdit(e, student)} className="text-blue-500 font-medium h-8 w-8 p-0">
                                                            ✎
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(student.id);
                                                        }} className="text-red-500 font-medium h-8 w-8 p-0">
                                                            🗑
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </li>
                                    )
                                })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
