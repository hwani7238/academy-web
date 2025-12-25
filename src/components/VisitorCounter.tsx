'use client';

import { useVisitorCounter } from '@/hooks/useVisitorCounter';
import { Users } from 'lucide-react';

export function VisitorCounter() {
    const count = useVisitorCounter();

    // If count is null (loading or error), maybe show nothing or a skeleton
    if (count === null) return null;

    return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>오늘 방문자: {count.toLocaleString()}</span>
        </div>
    );
}
