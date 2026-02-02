"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            router.push("/admin"); // 관리자 페이지로 이동
        } catch (err: any) {
            console.error("Login error:", err);
            let message = "로그인에 실패했습니다.";
            if (err.code === "auth/wrong-password") message = "비밀번호가 올바르지 않습니다.";
            else if (err.code === "auth/user-not-found") message = "등록되지 않은 사용자입니다.";
            else if (err.code === "auth/invalid-email") message = "유효하지 않은 이메일 형식입니다.";
            else if (err.code === "auth/too-many-requests") message = "잠시 후 다시 시도해주세요.";
            else if (err.code === "auth/invalid-credential") message = "이메일이 존재하지 않거나 비밀번호가 틀렸습니다.";

            setError(message + " (" + err.code + ")");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-[calc(100vh-14rem)] items-center justify-center py-12">
            <div className="mx-auto grid w-[350px] gap-6">
                <div className="grid gap-2 text-center">
                    <h1 className="text-3xl font-bold">로그인</h1>
                    <p className="text-balance text-muted-foreground">
                        관리자 계정으로 로그인하세요
                    </p>
                </div>
                <form onSubmit={handleLogin} className="grid gap-4">
                    <div className="grid gap-2">
                        <label htmlFor="email">아이디</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="admin@example.com"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <div className="flex items-center">
                            <label htmlFor="password">비밀번호</label>
                        </div>
                        <input
                            id="password"
                            type="password"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "로그인 중..." : "로그인"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
