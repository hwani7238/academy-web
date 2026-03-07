"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TEACHER_SUBJECTS } from "@/lib/constants";

interface AuthErrorShape {
    code?: string;
}

export default function TeacherSignupPage() {
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [subject, setSubject] = useState<string>(TEACHER_SUBJECTS[0]);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSignup = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setLoading(true);

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);

            try {
                await setDoc(doc(db, "users", userCredential.user.uid), {
                    email: userCredential.user.email,
                    name,
                    phone,
                    role: "teacher",
                    status: "pending",
                    subject,
                    createdAt: new Date(),
                    requestedAt: new Date(),
                });
            } catch (profileError) {
                await userCredential.user.delete();
                throw profileError;
            }

            router.push("/admin");
        } catch (err: unknown) {
            console.error("Teacher signup error:", err);
            const errorCode =
                typeof err === "object" && err !== null && "code" in err
                    ? String((err as AuthErrorShape).code)
                    : "";

            let message = "강사 가입 신청에 실패했습니다.";
            if (errorCode === "auth/email-already-in-use") {
                message = "이미 가입된 이메일입니다. 로그인 후 계정 상태를 확인해주세요.";
            } else if (errorCode === "auth/weak-password") {
                message = "비밀번호는 6자 이상이어야 합니다.";
            } else if (errorCode === "auth/invalid-email") {
                message = "유효하지 않은 이메일 형식입니다.";
            }

            setError(message + (errorCode ? ` (${errorCode})` : ""));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-[calc(100vh-14rem)] items-center justify-center py-12">
            <div className="mx-auto w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
                <div className="mb-6 text-center">
                    <h1 className="text-3xl font-bold">강사 계정 신청</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        계정 신청 후 관리자 승인이 완료되어야 로그인 사용이 가능합니다.
                    </p>
                </div>

                <form onSubmit={handleSignup} className="grid gap-4">
                    <div className="grid gap-2">
                        <label htmlFor="name">이름</label>
                        <input
                            id="name"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            required
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <label htmlFor="phone">연락처</label>
                        <input
                            id="phone"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={phone}
                            onChange={(event) => setPhone(event.target.value)}
                            placeholder="010-0000-0000"
                        />
                    </div>
                    <div className="grid gap-2">
                        <label htmlFor="subject">담당 과목</label>
                        <select
                            id="subject"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                        <label htmlFor="email">이메일</label>
                        <input
                            id="email"
                            type="email"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            required
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <label htmlFor="password">비밀번호</label>
                        <input
                            id="password"
                            type="password"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            required
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "신청 중..." : "강사 계정 신청"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => router.push("/login")}>
                        로그인으로 돌아가기
                    </Button>
                </form>
            </div>
        </div>
    );
}
