import React from 'react';

type Props = {
  onStart: () => void;
};

export default function HeroSection({ onStart }: Props) {
  return (
    <section className="text-center py-12">
      <h2 className="text-4xl sm:text-6xl font-extrabold tracking-tight">Your future in tech starts here</h2>
      <p className="mt-4 text-white/70 max-w-2xl mx-auto">TechIndiana helps Hoosiers find apprenticeship-ready pathways, employer partnerships, and AI-guided study plans tailored to each learner.</p>

      <div className="mt-8 flex items-center justify-center gap-4">
        <button onClick={onStart} className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 rounded-2xl font-bold">Talk to the AI Advisor</button>
        <a href="#programs" className="text-sm text-white/80 underline">Browse programs</a>
      </div>

      <div className="mt-8 max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white/3 p-4 rounded-lg">
          <h4 className="font-semibold">Earn while you learn</h4>
          <p className="text-xs text-white/70">Employer-backed apprenticeships and paid pathways that lead to jobs.</p>
        </div>
        <div className="bg-white/3 p-4 rounded-lg">
          <h4 className="font-semibold">College-friendly</h4>
          <p className="text-xs text-white/70">Pathways that preserve college options and credits where possible.</p>
        </div>
      </div>
    </section>
  );
}
