import { VisitorCounter } from "@/components/VisitorCounter";

export function Footer() {
    return (
        <footer className="border-t bg-muted/50">
            <div className="container mx-auto flex flex-col items-center justify-between gap-4 py-10 md:h-24 md:flex-row md:py-0">
                <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
                    <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                        © 2025 위뮤직 아카데미. All rights reserved.
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <VisitorCounter />
                </div>
            </div>
        </footer>
    );
}
