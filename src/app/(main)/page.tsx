import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowRight, Music, Star, Users } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-4 py-24 text-center md:px-8">
        <Image
          src="/hero-bg.png"
          alt="Music Academy Interior"
          fill
          className="object-cover -z-20"
          priority
        />
        <div className="absolute inset-0 -z-10 bg-black/40"></div>
        <h1 className="mb-6 text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl text-white">
          당신의 <span className="text-secondary">음악 여정</span>을<br className="md:hidden" /> 시작하세요
        </h1>
        <p className="mb-8 max-w-2xl text-lg text-white/90 sm:text-xl">
          위뮤직 아카데미는 모든 연령대를 위한 전문 음악 교육을 제공합니다.
          최고의 강사진과 함께 여러분의 재능을 발견해보세요.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Button size="lg" className="rounded-full text-lg">
            상담 신청하기 <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" size="lg" className="rounded-full text-lg">
            수업 과정 보기
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section id="about" className="container mx-auto py-24 px-4 sm:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-muted/30">
            <div className="mb-4 rounded-full bg-primary/10 p-4 text-primary">
              <Music className="h-8 w-8" />
            </div>
            <h3 className="mb-2 text-xl font-bold">전문 강사진</h3>
            <p className="text-muted-foreground">풍부한 경험을 가진 뮤지션들에게 체계적으로 배워보세요.</p>
          </div>
          <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-muted/30">
            <div className="mb-4 rounded-full bg-primary/10 p-4 text-primary">
              <Users className="h-8 w-8" />
            </div>
            <h3 className="mb-2 text-xl font-bold">커뮤니티</h3>
            <p className="text-muted-foreground">음악을 사랑하는 사람들과 함께 소통하며 성장하세요.</p>
          </div>
          <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-muted/30">
            <div className="mb-4 rounded-full bg-primary/10 p-4 text-primary">
              <Star className="h-8 w-8" />
            </div>
            <h3 className="mb-2 text-xl font-bold">정기 공연</h3>
            <p className="text-muted-foreground">갈고 닦은 실력을 무대 위에서 마음껏 뽐낼 수 있습니다.</p>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="bg-primary py-24 text-primary-foreground">
        <div className="container mx-auto px-4 text-center sm:px-8">
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl text-white">연주할 준비 되셨나요?</h2>
          <p className="mb-8 text-white/80">
            지금 바로 등록하고 당신만의 음악을 시작하세요.
          </p>
          <Button variant="secondary" size="lg" className="rounded-full">
            문의하기
          </Button>
        </div>
      </section>
    </div>
  );
}
