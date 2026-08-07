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
    subject?: string; // Legacy field
    subjects?: string[]; // Multi-subject support
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
    const [subjects, setSubjects] = useState<string[]>([TEACHER_SUBJECTS[0]]);
    const [loading, setLoading] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editSubjects, setEditSubjects] = useState<string[]>([]);

    // Students state for assignment view and transfer
    const [students, setStudents] = useState<any[]>([]);
    const [selectedTeacherForStudents, setSelectedTeacherForStudents] = useState<string | null>(null);
    const [transferTargetId, setTransferTargetId] = useState<string>("");
    const [transferLoading, setTransferLoading] = useState(false);
    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

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

    // Subscribe to students data
    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "students"), (snapshot) => {
            const studentsData: any[] = [];
            snapshot.forEach((docSnapshot) => {
                studentsData.push({ id: docSnapshot.id, ...docSnapshot.data() });
            });
            setStudents(studentsData);
        }, (error) => {
            console.error("Error fetching students for transfer:", error);
        });
        return () => unsubscribe();
    }, []);

    const getAssignedStudentsWithSubjects = (teacherId: string) => {
        const list: { student: any; subject: string }[] = [];
        const teacher = approvedTeachers.find(t => t.id === teacherId);
        if (!teacher) return list;

        const teacherSubjects = teacher.subjects || (teacher.subject ? [teacher.subject] : []);

        students.forEach(student => {
            const studentInstruments = student.instruments && student.instruments.length > 0
                ? student.instruments
                : (student.instrument ? [student.instrument] : []);

            studentInstruments.forEach((subj: string) => {
                // 피아노는 배정/이관에서 제외
                if (subj === "피아노") return;

                if (teacherSubjects.includes(subj)) {
                    const assignedId = student.teachers?.[subj];
                    if (assignedId === teacherId) {
                        // 명시적으로 본인에게 배정된 학생
                        list.push({ student, subject: subj });
                    } else if (!assignedId) {
                        // 배정 정보가 없는 기존 레거시 학생인 경우 임시로 해당 과목 강사들에게 모두 노출
                        list.push({ student, subject: subj });
                    }
                }
            });
        });
        return list;
    };

    const handleStudentSelectToggle = (studentId: string) => {
        setSelectedStudentIds(prev => 
            prev.includes(studentId)
                ? prev.filter(id => id !== studentId)
                : [...prev, studentId]
        );
    };

    const handleTransferStudents = async (sourceTeacherId: string, subject: string) => {
        if (selectedStudentIds.length === 0) {
            alert("이관할 학생을 최소 한 명 선택해주세요.");
            return;
        }
        if (!transferTargetId) {
            alert("이관받을 강사를 선택해주세요.");
            return;
        }
        const targetTeacher = approvedTeachers.find(t => t.id === transferTargetId);
        if (!targetTeacher) return;

        const targetSubjects = targetTeacher.subjects || (targetTeacher.subject ? [targetTeacher.subject] : []);
        if (!targetSubjects.includes(subject)) {
            if (!confirm(`선택한 강사(${targetTeacher.name})는 "${subject}" 과목 담당이 아닙니다. 그래도 이관하시겠습니까?`)) {
                return;
            }
        }

        if (!confirm(`선택한 ${selectedStudentIds.length}명의 학생들을 ${targetTeacher.name} 선생님에게 이관하시겠습니까?`)) {
            return;
        }

        setTransferLoading(true);
        try {
            const assigned = getAssignedStudentsWithSubjects(sourceTeacherId).filter(item => 
                item.subject === subject && selectedStudentIds.includes(item.student.id)
            );
            
            const promises = assigned.map(item => {
                const studentRef = doc(db, "students", item.student.id);
                const updatedTeachers = {
                    ...item.student.teachers,
                    [subject]: transferTargetId
                };
                return updateDoc(studentRef, { teachers: updatedTeachers });
            });

            await Promise.all(promises);
            alert(`총 ${assigned.length}명의 학생들이 ${targetTeacher.name} 선생님에게 이관되었습니다.`);
            setTransferTargetId("");
            setSelectedStudentIds([]);
            setSelectedTeacherForStudents(null);
        } catch (error) {
            console.error("Error transferring students:", error);
            alert("이관 실패");
        } finally {
            setTransferLoading(false);
        }
    };

    const pendingTeachers = teachers.filter((teacher) => teacher.status === "pending");
    const approvedTeachers = teachers.filter((teacher) => teacher.status !== "pending" && teacher.status !== "rejected");
    const rejectedTeachers = teachers.filter((teacher) => teacher.status === "rejected");

    const handleCreateTeacher = async (event: React.FormEvent) => {
        event.preventDefault();
        
        if (subjects.length === 0) {
            alert("최소 하나의 과목을 선택해주세요.");
            return;
        }
        
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
                subject: subjects[0], // Keep legacy for simplicity if needed
                subjects,
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
            setSubjects([TEACHER_SUBJECTS[0]]);
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
        const currentSubjects = teacher.subjects && teacher.subjects.length > 0
            ? teacher.subjects
            : (teacher.subject ? [teacher.subject] : []);
        setEditSubjects(currentSubjects);
    };

    const cancelEdit = () => {
        setEditingId(null);
    };

    const saveEdit = async (id: string) => {
        if (editSubjects.length === 0) {
            alert("최소 하나의 과목을 선택해야 합니다.");
            return;
        }

        try {
            await updateDoc(doc(db, "users", id), {
                name: editName,
                phone: editPhone,
                subject: editSubjects[0], // legacy
                subjects: editSubjects,
            });
            setEditingId(null);
        } catch (error) {
            console.error("Error updating teacher:", error);
            alert("수정 실패");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("강사 프로필을 삭제하시겠습니까? 이 강사에게 배정된 학생들은 모두 미배정 상태로 변경됩니다. (Auth 계정은 별도로 남을 수 있습니다.)")) return;

        setLoading(true);
        try {
            // 1. 이 강사에게 배정된 모든 학생을 찾아 배정 정보 제거 (미배정 상태로 전환)
            const assignedList = getAssignedStudentsWithSubjects(id);
            
            const promises = assignedList.map(item => {
                const studentRef = doc(db, "students", item.student.id);
                const updatedTeachers = { ...item.student.teachers };
                
                // 해당 과목의 담당 강사 매핑 삭제
                delete updatedTeachers[item.subject];
                
                return updateDoc(studentRef, { teachers: updatedTeachers });
            });

            await Promise.all(promises);

            // 2. 강사 프로필 삭제
            await deleteDoc(doc(db, "users", id));
            alert("강사 프로필이 삭제되었으며, 담당 학생들은 미배정 상태로 변경되었습니다.");
        } catch (error) {
            console.error("Error deleting teacher and unassigning students:", error);
            alert("삭제 실패");
        } finally {
            setLoading(false);
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
                    <label className="text-sm font-medium">담당 과목 (다중 선택 가능)</label>
                    <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                        {TEACHER_SUBJECTS.map((item) => (
                            <div key={item} className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id={`subject-${item}`}
                                    checked={subjects.includes(item)}
                                    onChange={(e) => {
                                        setSubjects(prev => 
                                            e.target.checked 
                                                ? [...prev, item] 
                                                : prev.filter(s => s !== item)
                                        );
                                    }}
                                    className="rounded border-gray-300"
                                />
                                <label htmlFor={`subject-${item}`} className="cursor-pointer text-sm select-none">
                                    {item}
                                </label>
                            </div>
                        ))}
                    </div>
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
                                            {teacher.subjects && teacher.subjects.length > 0 
                                                ? teacher.subjects.join(", ") 
                                                : (teacher.subject || "과목 미지정")}
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
                        <li key={teacher.id} className="flex flex-col rounded bg-slate-50 p-3 text-sm">
                            <div className="flex items-center justify-between w-full">
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
                                        <div className="col-span-1 sm:col-span-3">
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs border rounded p-2 bg-white">
                                                {TEACHER_SUBJECTS.map((item) => (
                                                    <div key={item} className="flex items-center space-x-1">
                                                        <input
                                                            type="checkbox"
                                                            id={`edit-subject-${item}`}
                                                            checked={editSubjects.includes(item)}
                                                            onChange={(e) => {
                                                                setEditSubjects(prev => 
                                                                    e.target.checked 
                                                                        ? [...prev, item] 
                                                                        : prev.filter(s => s !== item)
                                                                );
                                                            }}
                                                            className="rounded border-gray-300 h-3 w-3"
                                                        />
                                                        <label htmlFor={`edit-subject-${item}`} className="cursor-pointer select-none truncate">
                                                            {item}
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <span className="font-bold">{teacher.name}</span>
                                        <span className="ml-2 text-sm text-slate-600">
                                            ({teacher.subjects && teacher.subjects.length > 0 ? teacher.subjects.join(", ") : (teacher.subject || "과목 미지정")})
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
                                                onClick={() => {
                                                    setSelectedTeacherForStudents(
                                                        selectedTeacherForStudents === teacher.id ? null : teacher.id
                                                    );
                                                    setTransferTargetId("");
                                                }}
                                                className={`h-8 font-medium ${
                                                    selectedTeacherForStudents === teacher.id 
                                                        ? "text-indigo-600 bg-indigo-50 font-bold px-2 rounded" 
                                                        : "text-slate-600"
                                                }`}
                                            >
                                                {selectedTeacherForStudents === teacher.id ? "닫기" : "학생 조회"}
                                            </Button>
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
                            </div>

                            {/* 담당 학생 및 일괄 이관 UI */}
                            {selectedTeacherForStudents === teacher.id && (
                                <div className="mt-3 border-t pt-3 w-full bg-white p-3 rounded border text-left">
                                    <h5 className="font-semibold text-xs text-slate-700 mb-2">담당 학생 목록 및 이관</h5>
                                    {(() => {
                                        const assignedList = getAssignedStudentsWithSubjects(teacher.id);
                                        const subjectsMap: { [sub: string]: any[] } = {};
                                        assignedList.forEach(item => {
                                            if (!subjectsMap[item.subject]) {
                                                subjectsMap[item.subject] = [];
                                            }
                                            subjectsMap[item.subject].push(item.student);
                                        });

                                        const subjectKeys = Object.keys(subjectsMap);

                                        if (subjectKeys.length === 0) {
                                            return <p className="text-xs text-slate-500 py-2">담당하고 있는 학생이 없습니다.</p>;
                                        }

                                        return (
                                            <div className="space-y-4">
                                                {subjectKeys.map(subj => {
                                                    const list = subjectsMap[subj];
                                                    const candidateTeachers = approvedTeachers.filter(t => 
                                                        t.id !== teacher.id && 
                                                        (t.subjects?.includes(subj) || t.subject === subj)
                                                    );

                                                    return (
                                                        <div key={subj} className="border rounded p-2 bg-slate-50/50">
                                                            <div className="flex items-center justify-between border-b pb-1 mb-2">
                                                                <span className="font-bold text-xs text-blue-600">[{subj}] 수강생 ({list.length}명)</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const allIds = list.map(std => std.id);
                                                                        const isAllSelected = allIds.every(id => selectedStudentIds.includes(id));
                                                                        if (isAllSelected) {
                                                                            setSelectedStudentIds(prev => prev.filter(id => !allIds.includes(id)));
                                                                        } else {
                                                                            setSelectedStudentIds(prev => [...new Set([...prev, ...allIds])]);
                                                                        }
                                                                    }}
                                                                    className="text-[10px] text-slate-500 hover:text-slate-700 underline font-medium"
                                                                >
                                                                    {list.every(std => selectedStudentIds.includes(std.id)) ? "전체 해제" : "전체 선택"}
                                                                </button>
                                                            </div>
                                                            <ul className="space-y-1 max-h-32 overflow-y-auto mb-2 pr-1">
                                                                {list.map(std => {
                                                                    const isSelected = selectedStudentIds.includes(std.id);
                                                                    return (
                                                                        <li 
                                                                            key={std.id} 
                                                                            onClick={() => handleStudentSelectToggle(std.id)}
                                                                            className={`text-xs flex items-center justify-between px-2 py-1 rounded border cursor-pointer select-none transition-colors ${
                                                                                isSelected ? "bg-indigo-50 border-indigo-200 text-indigo-900" : "bg-white text-slate-600 hover:bg-slate-100"
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-center gap-2">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={isSelected}
                                                                                    onChange={() => {}}
                                                                                    className="rounded border-gray-300 pointer-events-none"
                                                                                />
                                                                                <span className="font-medium">{std.name}</span>
                                                                            </div>
                                                                            <span className="text-[10px] text-slate-400">{std.phone}</span>
                                                                        </li>
                                                                    );
                                                                })}
                                                            </ul>
                                                            <div className="flex items-center gap-2 mt-2">
                                                                <select
                                                                    className="h-8 rounded border text-xs px-2 bg-white flex-1"
                                                                    value={transferTargetId}
                                                                    onChange={(e) => setTransferTargetId(e.target.value)}
                                                                >
                                                                    <option value="">이관받을 새 선생님 선택</option>
                                                                    {candidateTeachers.map(t => (
                                                                        <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                                                                    ))}
                                                                </select>
                                                                <Button
                                                                    size="sm"
                                                                    disabled={transferLoading || !transferTargetId || selectedStudentIds.length === 0}
                                                                    onClick={() => handleTransferStudents(teacher.id, subj)}
                                                                    className="h-8 text-xs font-semibold px-3 bg-indigo-600 hover:bg-indigo-700 text-white"
                                                                >
                                                                    {transferLoading ? "이관 중..." : `선택 이관 (${selectedStudentIds.filter(id => list.some(std => std.id === id)).length}명)`}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
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
