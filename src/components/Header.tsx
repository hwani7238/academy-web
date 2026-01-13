import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function Header() {
    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto flex h-14 items-center justify-between px-4">
                <div className="flex items-center gap-2">
                    <Link href="/" className="flex items-center font-bold text-xl">
                        Whee Music Academy
                    </Link>
                </div>

                <nav className="flex items-center gap-4">
                    <Link href="/about" className="text-sm font-medium transition-colors hover:text-primary">
                        학원 소개
                    </Link>
                    <Link href="#classes" className="text-sm font-medium transition-colors hover:text-primary">
                        수업 안내
                    </Link>
                    <Link href="#contact" className="text-sm font-medium transition-colors hover:text-primary">
                        문의하기
                    </Link>
                    <Button size="sm" asChild>
                        <Link href="/login">
                            로그인
                        </Link>
                    </Button>
                </nav>
            </div>
        </header>
    );
}
