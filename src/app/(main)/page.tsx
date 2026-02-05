import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Music, Star, Users, CheckCircle } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-[#f5f5f7]">
      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center pt-32 pb-20 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_120%,#dbeafe,transparent)] opacity-70" />
        
        <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto z-10">
            <h1 className="text-5xl md:text-7xl font-semibold tracking-tight text-slate-900 leading-[1.1]">
            음악이 당신의<br/>
            <span className="text-gradient">삶이 되는 순간.</span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-500 font-medium max-w-2xl mx-auto leading-relaxed">
            위뮤직 아카데미에서 시작하는<br className="md:hidden"/> 프리미엄 음악 교육 경험.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
            <Button size="lg" className="rounded-full px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-all duration-300 bg-[#0071e3] hover:bg-[#0077ed]">
                무료 상담 신청하기
            </Button>
            <Button variant="outline" size="lg" className="rounded-full px-8 py-6 text-lg border-slate-300 hover:bg-white/50 backdrop-blur-sm">
                커리큘럼 살펴보기
            </Button>
            </div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section className="container mx-auto px-4 py-24">
        <h2 className="text-3xl md:text-5xl font-semibold text-center mb-16 tracking-tight">
          왜 위뮤직인가요?
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {/* Feature 1 (Large) */}
          <div className="md:col-span-2 rounded-3xl bg-white p-10 shadow-sm hover:shadow-md transition-shadow duration-300 border border-slate-100 flex flex-col justify-between h-[320px]">
            <div>
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 mb-6">
                <Music className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold mb-3">개인 맞춤형 커리큘럼</h3>
                <p className="text-slate-500 text-lg">
                수강생의 목표와 실력에 맞춰 1:1로 설계되는 독자적인 교육 과정.<br/>
                취미부터 입시까지, 당신만을 위한 로드맵을 제시합니다.
                </p>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="rounded-3xl bg-white p-10 shadow-sm hover:shadow-md transition-shadow duration-300 border border-slate-100 flex flex-col justify-between h-[320px]">
             <div>
                <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 mb-6">
                <Users className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold mb-3">최고의 강사진</h3>
                <p className="text-slate-500 text-lg">
                현역 뮤지션으로 구성된<br/>강사진의 생생한 노하우.
                </p>
             </div>
          </div>

          {/* Feature 3 */}
          <div className="rounded-3xl bg-white p-10 shadow-sm hover:shadow-md transition-shadow duration-300 border border-slate-100 flex flex-col justify-between h-[320px]">
             <div>
                <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center text-green-600 mb-6">
                <CheckCircle className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold mb-3">연습실 무제한</h3>
                <p className="text-slate-500 text-lg">
                수강생이라면 언제든.<br/>쾌적한 연습 공간 제공.
                </p>
             </div>
          </div>

          {/* Feature 4 (Large) */}
          <div className="md:col-span-2 rounded-3xl bg-black text-white p-10 shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col justify-between h-[320px] relative overflow-hidden group">
            <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-6">
                <Star className="w-6 h-6 text-yellow-400" />
                </div>
                <h3 className="text-2xl font-bold mb-3">정기 연주회 & 무대 경험</h3>
                <p className="text-white/70 text-lg">
                연습실을 넘어 무대로. <br/>
                매년 개최되는 정기 연주회를 통해 뮤지션으로서의 첫 걸음을 내딛으세요.
                </p>
            </div>
            <div className="absolute right-0 bottom-0 w-64 h-64 bg-gradient-to-tl from-blue-600 to-purple-600 rounded-full blur-[80px] opacity-50 group-hover:opacity-70 transition-opacity" />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-4 text-center">
        <div className="max-w-3xl mx-auto space-y-8">
            <h2 className="text-4xl md:text-6xl font-semibold tracking-tight">
            망설이지 말고 시작하세요.
            </h2>
            <p className="text-xl text-slate-500">
            상담은 언제나 무료입니다.
            </p>
            <div className="pt-4">
                <Button size="lg" className="rounded-full px-10 py-7 text-lg bg-black text-white hover:bg-slate-800 shadow-xl">
                    상담 예약하기
                </Button>
            </div>
        </div>
      </section>
    </div>
  );
}
