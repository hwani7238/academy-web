import Link from 'next/link';

export function Header() {
    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto flex h-14 items-center justify-between px-2 sm:px-4">
                <div className="flex items-center gap-2 shrink-0">
                    <Link href="/" className="flex items-center font-bold text-base sm:text-xl tracking-tight">
                        Whee Music Academy
                    </Link>
                </div>

                <nav className="flex items-center gap-3 sm:gap-4 overflow-x-auto scrollbar-hide">
                    <Link href="/about" className="text-xs sm:text-sm font-medium transition-colors hover:text-primary whitespace-nowrap shrink-0">
                        학원 소개
                    </Link>
                    <Link href="#classes" className="text-xs sm:text-sm font-medium transition-colors hover:text-primary whitespace-nowrap shrink-0">
                        수업 안내
                    </Link>
                    <Link href="#contact" className="text-xs sm:text-sm font-medium transition-colors hover:text-primary whitespace-nowrap shrink-0">
                        문의하기
                    </Link>
                    <Link href="/login" className="text-xs sm:text-sm font-medium transition-colors hover:text-primary whitespace-nowrap shrink-0">
                        로그인
                    </Link>
                </nav>
            </div>
        </header>
    );
}
