"use client";

import { useEffect, useState } from "react";
import { collectionGroup, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function DebugPage() {
    const [status, setStatus] = useState("Checking...");
    const [errorMsg, setErrorMsg] = useState("");
    const [indexLink, setIndexLink] = useState("");

    useEffect(() => {
        const check = async () => {
            try {
                const q = query(
                    collectionGroup(db, "logs"),
                    orderBy("createdAt", "desc"),
                    limit(1)
                );
                await getDocs(q);
                setStatus("Success! Query worked (Index exists).");
            } catch (error: any) {
                console.error(error);
                setStatus("Query Failed");
                setErrorMsg(error.message);

                // Extract link if possible, or just look for the pattern
                const match = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
                if (match) {
                    setIndexLink(match[0]);
                }
            }
        };
        check();
    }, []);

    return (
        <div className="p-10 max-w-2xl mx-auto text-center space-y-6">
            <h1 className="text-2xl font-bold">시스템 진단 (Debug)</h1>
            <p className="text-lg font-medium">{status}</p>

            {indexLink && (
                <div className="p-6 border rounded bg-yellow-50">
                    <p className="mb-4 font-bold text-red-600">⚠ 데이터베이스 색인(Index) 설정이 필요합니다.</p>
                    <p className="mb-4">아래 파란색 버튼을 눌러 승인창에서 '색인 만들기'를 진행해 주세요.</p>
                    <a
                        href={indexLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                    >
                        색인 만들기 (클릭)
                    </a>
                </div>
            )}

            {errorMsg && !indexLink && (
                <div className="p-4 bg-gray-100 rounded text-left overflow-auto text-sm">
                    <p className="font-bold">Error Details:</p>
                    <pre>{errorMsg}</pre>
                </div>
            )}
        </div>
    );
}
