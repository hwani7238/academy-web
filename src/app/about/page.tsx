import Image from "next/image";

export default function AboutPage() {
    return (
        <div className="container mx-auto max-w-4xl px-4 py-16">
            <div className="flex flex-col gap-16">

                {/* Greetings Section */}
                <section className="flex flex-col gap-6 text-center md:text-left">
                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold tracking-tight md:text-4xl text-primary">원장님 인사말</h1>
                        <div className="h-1 w-20 bg-primary/20 mx-auto md:mx-0 rounded-full"></div>
                    </div>
                    <div className="prose prose-lg text-muted-foreground dark:prose-invert">
                        <p className="leading-relaxed">
                            안녕하세요, 위뮤직 아카데미에 오신 것을 환영합니다.
                        </p>
                        <p className="leading-relaxed">
                            음악은 우리 삶을 풍요롭게 만드는 가장 아름다운 언어입니다.
                            저희 아카데미는 단순한 기술 습득을 넘어, 음악을 통해 자신을 표현하고
                            즐거움을 찾을 수 있는 공간이 되고자 합니다.
                        </p>
                        <p className="leading-relaxed">
                            체계적인 커리큘럼과 따뜻한 소통으로 여러분의 음악적 꿈을 응원하겠습니다.
                            감사합니다.
                        </p>
                    </div>
                </section>

                {/* Profile Section */}
                <section className="grid gap-12 md:grid-cols-3 md:items-start">
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
                        <Image
                            src="/director.jpg"
                            alt="원장님 프로필"
                            fill
                            className="object-cover"
                        />
                    </div>
                    <div className="flex flex-col gap-6 md:col-span-2">
                        <div className="space-y-2 text-center md:text-left">
                            <h2 className="text-3xl font-bold tracking-tight md:text-4xl text-primary">원장님 프로필</h2>
                            <div className="h-1 w-20 bg-primary/20 mx-auto md:mx-0 rounded-full"></div>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-xl border bg-card p-6 shadow-sm">
                                <h3 className="mb-4 text-lg font-semibold text-primary">주요 이력</h3>
                                <ul className="space-y-3 text-muted-foreground">
                                    <li className="flex items-start gap-2">
                                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0"></span>
                                        <span>중앙대학교 음악대학 작곡과 졸업</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0"></span>
                                        <span>중앙대학교 교육대학원 음악학과 졸업</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0"></span>
                                        <span>이탈리아 Rossini 국립음악원 피아노과 석사 과정 졸업</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0"></span>
                                        <span>이탈리아 International Music Academy 수료</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0"></span>
                                        <span>경기도 중등 음악교사 경력</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0"></span>
                                        <span>음악 강의 플랫폼 &lt;기초 음악 이론&gt; 강의</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
}
