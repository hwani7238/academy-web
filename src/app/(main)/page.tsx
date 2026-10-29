import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Music, Star, Users } from "lucide-react";
import styles from "./home.module.css";

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroMain}>
          <div className={styles.copy}>
            <h1 id="hero-title" className={styles.title}>
              <span>음악이 시작되는 곳,</span>
              <span>내가 달라지는 시간.</span>
            </h1>
            <p className={styles.subtitle}>위뮤직 아카데미에서 시작하세요.</p>
            <div className={styles.actions}>
              <Link href="#contact" className={styles.primaryLink}>상담 신청하기</Link>
              <Link href="#classes" className={styles.secondaryLink}>
                수업 과정 보기 <ArrowUpRight size={20} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className={styles.art} aria-hidden="true">
            <Image src="/whee-wave.png" alt="" width={1586} height={992}
              sizes="(max-width: 767px) 90vw, 46vw" priority className={styles.wave} />
          </div>
        </div>
        <div id="classes" className={styles.subjects} aria-label="주요 수업 과목">
          <span lang="en">PIANO</span><span lang="en">GUITAR</span>
          <span lang="en">DRUMS</span><span lang="en">VOCAL</span>
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
      <section id="contact" className="bg-primary py-24 text-primary-foreground">
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
