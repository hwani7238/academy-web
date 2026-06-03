"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Music, LogOut, ChevronRight, BookOpen, Film, Image as ImageIcon, Calendar } from "lucide-react";

interface Student {
    id: string;
    name: string;
    instruments: string[];
    createdAt?: string;
}

interface LearningLog {
    id: string;
    instrument?: string;
    progress?: string;
    feedback?: string;
    createdAt?: string;
    reportToken?: string;
    mediaFiles?: { url: string; type: string; path: string; title?: string }[];
    textbookImages?: { url: string; path: string }[];
}

interface Match {
    student: Student;
    logs: LearningLog[];
}

export default function WorldPage() {
    const [digits, setDigits] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [screen, setScreen] = useState<"login" | "select" | "dashboard">("login");
    const [matches, setMatches] = useState<Match[]>([]);
    const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
    const [currentLogs, setCurrentLogs] = useState<LearningLog[]>([]);
    const router = useRouter();

    // Check for existing session in localStorage
    useEffect(() => {
        const savedStudent = localStorage.getItem("wma_world_student");
        const savedLogs = localStorage.getItem("wma_world_logs");
        if (savedStudent && savedLogs) {
            try {
                setCurrentStudent(JSON.parse(savedStudent));
                setCurrentLogs(JSON.parse(savedLogs));
                setScreen("dashboard");
            } catch (e) {
                console.error("Failed to parse saved session", e);
                localStorage.removeItem("wma_world_student");
                localStorage.removeItem("wma_world_logs");
            }
        }
    }, []);

    // Add support for keyboard inputs (numbers only)
    useEffect(() => {
        if (screen !== "login") return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key >= "0" && e.key <= "9") {
                if (digits.length < 4) {
                    setDigits(prev => prev + e.key);
                }
            } else if (e.key === "Backspace") {
                setDigits(prev => prev.slice(0, -1));
            } else if (e.key === "Enter") {
                if (digits.length === 4) {
                    void handleSubmit();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [digits, screen]);

    const handleKeypadPress = (val: string) => {
        setError("");
        if (val === "CLEAR") {
            setDigits("");
        } else if (val === "ENTER") {
            if (digits.length === 4) {
                void handleSubmit();
            } else {
                setError("4자리 번호를 입력해주세요.");
            }
        } else {
            if (digits.length < 4) {
                setDigits(prev => prev + val);
            }
        }
    };

    const handleSubmit = async () => {
        if (digits.length !== 4) {
            setError("휴대폰 번호 뒷자리 4자리를 입력해주세요.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const response = await fetch("/api/world/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ digits }),
            });

            if (!response.ok) {
                throw new Error("서버 응답 오류");
            }

            const data = await response.json();
            if (data.ok) {
                const results: Match[] = data.matches || [];
                if (results.length === 0) {
                    setError("등록되지 않은 전화번호입니다. 번호를 확인해주세요.");
                    setDigits("");
                } else if (results.length === 1) {
                    // Log in immediately
                    loginStudent(results[0].student, results[0].logs);
                } else {
                    // Show selection screen
                    setMatches(results);
                    setScreen("select");
                }
            } else {
                setError(data.error || "로그인 실패");
            }
        } catch (err) {
            console.error("Login error:", err);
            setError("로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        } finally {
            setLoading(false);
        }
    };

    const loginStudent = (student: Student, logs: LearningLog[]) => {
        setCurrentStudent(student);
        setCurrentLogs(logs);
        localStorage.setItem("wma_world_student", JSON.stringify(student));
        localStorage.setItem("wma_world_logs", JSON.stringify(logs));
        setScreen("dashboard");
    };

    const handleLogout = () => {
        setCurrentStudent(null);
        setCurrentLogs([]);
        setDigits("");
        setMatches([]);
        localStorage.removeItem("wma_world_student");
        localStorage.removeItem("wma_world_logs");
        setScreen("login");
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return "-";
        try {
            return new Date(dateStr).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
            });
        } catch (e) {
            return dateStr;
        }
    };

    return (
        <div className="relative flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center overflow-hidden px-4 py-8">
            {/* Fonts & Animation CSS */}
            <style jsx global>{`
                @import url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/DungGeunMo.css');
                
                @keyframes scrollBg {
                    0% { transform: translate3d(0, 0, 0); }
                    100% { transform: translate3d(-50%, 0, 0); }
                }
                .animate-scroll-bg {
                    background-image: url('/pixel_modern_stage_background.png');
                    background-repeat: repeat-x;
                    background-size: auto 100%;
                    width: 4000px;
                    height: 100%;
                    position: absolute;
                    top: 0;
                    left: 0;
                    z-index: -20;
                    animation: scrollBg 140s linear infinite;
                }
                
                @keyframes bounceSplash {
                    0% { transform: scale(1) rotate(-15deg); }
                    50% { transform: scale(1.15) rotate(-15deg); }
                    100% { transform: scale(1) rotate(-15deg); }
                }
                .mc-splash {
                    display: inline-block;
                    color: #ffff22;
                    text-shadow: 2px 2px 0px #3f3f00;
                    font-family: 'DungGeunMo', monospace;
                    font-size: 14px;
                    font-weight: bold;
                    animation: bounceSplash 1.2s ease-in-out infinite;
                }

                .dunggeunmo {
                    font-family: 'DungGeunMo', 'Courier New', Courier, monospace;
                }

                /* Minecraft Pixel Bevel Button styling */
                .mc-btn {
                    font-family: 'DungGeunMo', monospace;
                    background-color: #8c8c8c;
                    border: 2px solid #000;
                    border-top-color: #dfdfdf;
                    border-left-color: #dfdfdf;
                    border-bottom-color: #555555;
                    border-right-color: #555555;
                    color: #ffffff;
                    text-shadow: 2px 2px 0px #3f3f3f;
                    box-shadow: 0 4px 0 #000;
                    transition: all 0.05s ease;
                }
                .mc-btn:hover {
                    background-color: #526f35;
                    border-top-color: #a3c988;
                    border-left-color: #a3c988;
                    border-bottom-color: #2b3b1b;
                    border-right-color: #2b3b1b;
                }
                .mc-btn:active {
                    border-top-color: #555555;
                    border-left-color: #555555;
                    border-bottom-color: #dfdfdf;
                    border-right-color: #dfdfdf;
                    transform: translateY(2px);
                    box-shadow: 0 2px 0 #000;
                }
                .mc-btn:disabled {
                    background-color: #555555;
                    color: #aaaaaa;
                    border-color: #333333;
                    text-shadow: none;
                    box-shadow: none;
                    transform: none;
                    cursor: not-allowed;
                }

                .mc-border {
                    border: 4px solid #3c3c3c;
                    box-shadow: 0 0 0 4px #000;
                }
            `}</style>

            {/* Seamless Voxel Grassy Hill Scrolling Background */}
            <div className="animate-scroll-bg" />
            <div className="absolute inset-0 bg-black/15 -z-10" />

            {/* Main Content Area */}
            <div className="w-full max-w-md z-10 flex flex-col items-center">
                {/* Header title */}
                <div className="mb-8 text-center relative select-none">
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-wider text-[#ffd54f] select-none dunggeunmo transition-transform duration-200"
                        style={{
                            textShadow: "3px 3px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000, 1px 1px 0px #000, 4px 6px 0px rgba(0,0,0,0.4)",
                            transform: "rotate(-3deg) scale(1)",
                        }}>
                        위뮤직월드
                    </h1>
                    <div className="absolute -bottom-6 right-0 sm:-right-4 mt-2">
                        <span className="mc-splash transform -rotate-12">
                            음악과 배움의 세계!
                        </span>
                    </div>
                </div>

                {/* Switch screen views */}
                {screen === "login" && (
                    <div className="w-full bg-slate-900/80 backdrop-blur-md rounded-2xl p-6 text-white border border-slate-700/50 shadow-2xl mc-border">
                        <p className="text-center text-sm mb-6 text-slate-300 dunggeunmo">
                            휴대폰 번호 뒷자리 4자리를 눌러 입장하세요
                        </p>

                        {/* Digit Display */}
                        <div className="w-full h-14 bg-black border-2 border-slate-700 rounded-lg flex items-center justify-center text-2xl font-bold tracking-[0.6em] mb-4 text-[#a3c988] dunggeunmo">
                            {digits.padEnd(4, "_")}
                        </div>

                        {error && (
                            <p className="text-center text-xs text-red-400 mb-4 font-semibold px-2">
                                {error}
                            </p>
                        )}

                        {/* Numeric Keypad */}
                        <div className="grid grid-cols-3 gap-2 mb-6">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                <button
                                    key={num}
                                    type="button"
                                    onClick={() => handleKeypadPress(String(num))}
                                    className="h-12 text-lg mc-btn"
                                >
                                    {num}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => handleKeypadPress("CLEAR")}
                                className="h-12 text-sm mc-btn hover:bg-red-800 hover:border-red-900"
                            >
                                C
                            </button>
                            <button
                                type="button"
                                onClick={() => handleKeypadPress("0")}
                                className="h-12 text-lg mc-btn"
                            >
                                0
                            </button>
                            <button
                                type="button"
                                onClick={() => handleKeypadPress("ENTER")}
                                className="h-12 text-sm mc-btn hover:bg-emerald-800 hover:border-emerald-900"
                                disabled={loading}
                            >
                                {loading ? "..." : "OK"}
                            </button>
                        </div>

                        {/* Additional links */}
                        <div className="flex justify-between items-center text-xs text-slate-400 font-semibold pt-2 dunggeunmo">
                            <Link href="/" className="hover:text-white transition-colors">
                                &larr; 홈으로
                            </Link>
                            <Link href="/#contact" className="hover:text-white transition-colors">
                                학원 문의하기
                            </Link>
                        </div>
                    </div>
                )}

                {screen === "select" && (
                    <div className="w-full bg-slate-900/80 backdrop-blur-md rounded-2xl p-6 text-white border border-slate-700/50 shadow-2xl mc-border dunggeunmo">
                        <h3 className="text-center text-base mb-4 text-[#ffd54f]">
                            학생 선택
                        </h3>
                        <p className="text-center text-xs mb-6 text-slate-300">
                            동일한 번호로 등록된 학생이 있습니다.<br />본인의 이름을 선택해주세요.
                        </p>

                        <div className="flex flex-col gap-3 mb-6">
                            {matches.map(m => (
                                <button
                                    key={m.student.id}
                                    type="button"
                                    onClick={() => loginStudent(m.student, m.logs)}
                                    className="w-full h-12 text-sm text-left px-4 flex items-center justify-between mc-btn"
                                >
                                    <span>{m.student.name}</span>
                                    <span className="text-xs opacity-85 text-yellow-300">
                                        ({m.student.instruments.join(", ")})
                                    </span>
                                </button>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setScreen("login");
                                setDigits("");
                                setError("");
                            }}
                            className="w-full h-10 text-xs mc-btn hover:bg-red-800"
                        >
                            뒤로가기
                        </button>
                    </div>
                )}

                {screen === "dashboard" && currentStudent && (
                    <div className="w-full max-w-2xl bg-white/95 backdrop-blur-md rounded-3xl p-6 text-slate-800 shadow-2xl border border-slate-200 mt-4">
                        {/* Student welcome head */}
                        <div className="flex items-center justify-between border-b pb-4 mb-6">
                            <div>
                                <p className="text-xs text-slate-500 font-bold tracking-wider uppercase">
                                    WeMusic World
                                </p>
                                <h2 className="text-xl font-extrabold text-slate-900">
                                    {currentStudent.name} 학생 기록실
                                </h2>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleLogout}
                                className="h-9 px-3 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 font-bold transition-all flex items-center gap-1.5"
                            >
                                <LogOut className="h-4 w-4" /> 로그아웃
                            </Button>
                        </div>

                        {/* Student info widgets */}
                        <div className="bg-slate-50 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row gap-4 justify-between text-sm border">
                            <div>
                                <p className="text-slate-400 text-xs font-semibold">수강 과목</p>
                                <p className="font-extrabold text-slate-800 text-base mt-1 flex items-center gap-1">
                                    <Music className="h-4 w-4 text-slate-600" />
                                    {currentStudent.instruments.join(", ")}
                                </p>
                            </div>
                            {currentStudent.createdAt && (
                                <div className="sm:text-right">
                                    <p className="text-slate-400 text-xs font-semibold">아카데미 등록일</p>
                                    <p className="font-bold text-slate-700 mt-1">
                                        {formatDate(currentStudent.createdAt)}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Learning logs list */}
                        <h3 className="font-extrabold text-slate-900 mb-4 flex items-center gap-1.5 text-base">
                            📌 최근 선생님 피드백 ({currentLogs.length})
                        </h3>

                        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                            {currentLogs.map(log => (
                                <div
                                    key={log.id}
                                    className="bg-white rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all duration-200"
                                >
                                    <div className="flex justify-between items-start mb-3 border-b pb-2">
                                        <div>
                                            <span className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                                                <Calendar className="h-3 w-3 text-slate-400" />
                                                {formatDate(log.createdAt)}
                                            </span>
                                            {log.instrument && (
                                                <span className="mt-1 inline-block rounded bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-100">
                                                    {log.instrument}
                                                </span>
                                            )}
                                        </div>
                                        {log.reportToken && (
                                            <Link
                                                href={`/report/${currentStudent.id}/${log.id}?t=${encodeURIComponent(log.reportToken)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs bg-slate-900 hover:bg-slate-800 text-white py-1.5 px-3 rounded-full font-bold flex items-center gap-0.5 transition-colors"
                                            >
                                                리포트 전체 보기 <ChevronRight className="h-3 w-3" />
                                            </Link>
                                        )}
                                    </div>

                                    {/* Progress textbook info */}
                                    {log.progress && (
                                        <div className="text-sm text-slate-700 mb-2 flex items-start gap-1">
                                            <BookOpen className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                                            <p>
                                                <span className="font-bold text-slate-800">진도 교재:</span> {log.progress}
                                            </p>
                                        </div>
                                    )}

                                    {/* Feedback message */}
                                    {log.feedback && (
                                        <div className="p-3 bg-slate-50 rounded-xl border text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                            {log.feedback}
                                        </div>
                                    )}

                                    {/* Media previews inside log widget */}
                                    {((log.textbookImages && log.textbookImages.length > 0) || (log.mediaFiles && log.mediaFiles.length > 0)) && (
                                        <div className="flex gap-2 flex-wrap mt-3 text-xs text-slate-500">
                                            {log.textbookImages && log.textbookImages.length > 0 && (
                                                <span className="flex items-center gap-1 bg-slate-100 rounded-full py-1 px-2.5">
                                                    <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                                                    교재 사진 {log.textbookImages.length}장
                                                </span>
                                            )}
                                            {log.mediaFiles && log.mediaFiles.length > 0 && (
                                                <span className="flex items-center gap-1 bg-slate-100 rounded-full py-1 px-2.5">
                                                    <Film className="h-3.5 w-3.5 text-slate-400" />
                                                    미디어 파일 {log.mediaFiles.length}개
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {currentLogs.length === 0 && (
                                <div className="text-center text-slate-400 py-12 bg-slate-50 border border-dashed rounded-2xl">
                                    <p className="text-sm">아직 등록된 학습 피드백 기록이 없습니다.</p>
                                    <p className="text-xs mt-1">학원 수업 후 첫 피드백이 생성되면 이곳에 노출됩니다.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
