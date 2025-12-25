import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, increment, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function useVisitorCounter() {
    const [todayCount, setTodayCount] = useState<number | null>(null);

    useEffect(() => {
        // Basic date string for "today" in YYYY-MM-DD
        const today = new Date().toISOString().split('T')[0];
        const docRef = doc(db, 'daily_stats', today);

        // Increment count on mount (once per session ideally, but simple increment for now)
        // To prevent strict React Dev Mode double-count, we can check a ref or just accept it's a demo
        // For a real app, use a session cookie or local storage to prevent refresh-spamming.
        // Here we'll just check sessionStorage.

        const hasVisited = typeof window !== 'undefined' ? sessionStorage.getItem(`visited-${today}`) : false;

        if (!hasVisited && typeof window !== 'undefined') {
            const incrementCount = async () => {
                try {
                    // Try to update, if doc doesn't exist, set it
                    // setDoc with merge: true might not work for increment on non-existent.
                    // Safer: get, then set or update.
                    // Or just setDoc with { count: increment(1) } and merge: true
                    await setDoc(docRef, { count: increment(1) }, { merge: true });
                    sessionStorage.setItem(`visited-${today}`, 'true');
                } catch (error) {
                    console.error("Error incrementing visitor count:", error);
                    // If permission denied (expected if rules not set), we handle gracefully
                }
            };
            incrementCount();
        }

        // Listen for real-time updates
        const unsubscribe = onSnapshot(docRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                setTodayCount(data.count ?? 0);
            } else {
                setTodayCount(0);
            }
        }, (error) => {
            console.error("Error listening to visitor count:", error);
            // Fallback or ignore
        });

        return () => unsubscribe();
    }, []);

    return todayCount;
}
