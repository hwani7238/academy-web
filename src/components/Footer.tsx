import { VisitorCounter } from "@/components/VisitorCounter";

export function Footer() {
    return (
        <footer className="border-t bg-muted/50">
            <div className="container mx-auto flex flex-col items-center justify-between gap-4 py-10 md:h-24 md:flex-row md:py-0">
                <div className="flex flex-col items-center gap-1 text-center md:items-start md:text-left">
                    <p className="text-sm text-muted-foreground">
                        © 2025 위뮤직 아카데미. All rights reserved.
                    </p>
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground/80 md:flex-row md:gap-4">
                        <span>사업자 등록번호: 658-98-01692</span>
                        <span className="hidden md:inline">|</span>
                        <span>주소: 경기도 성남시 수내동 내정로 173번길 11</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <VisitorCounter />
                </div>
            </div>
        </footer>
    );
}
