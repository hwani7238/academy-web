import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function WorldPage() {
    return (
        <div className="bg-slate-50">
            <section className="mx-auto flex min-h-[calc(100vh-14rem)] max-w-5xl flex-col justify-center px-4 py-20 sm:px-8">
                <div className="max-w-3xl">
                    <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
                        Whee Music World
                    </p>
                    <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
                        위뮤직월드
                    </h1>
                    <p className="mt-6 text-lg leading-8 text-slate-600">
                        위뮤직월드는 음악을 배우는 것을 넘어 공연, 콘텐츠, 커뮤니티 경험까지 확장하는
                        위뮤직의 새로운 공간입니다. 현재 페이지는 준비 중이며, 곧 더 자세한 소식을
                        안내드릴 예정입니다.
                    </p>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <Button asChild size="lg">
                            <Link href="/#contact">문의하기</Link>
                        </Button>
                        <Button asChild variant="outline" size="lg">
                            <Link href="/">메인으로 돌아가기</Link>
                        </Button>
                    </div>
                </div>
            </section>
        </div>
    );
}
