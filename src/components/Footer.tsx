import React from 'react';

export default function Footer(){
  return (
    <footer className="mt-12 py-8 text-center text-sm text-white/60">
      <div className="max-w-4xl mx-auto">© {new Date().getFullYear()} TechIndiana — Empowering Indiana's tech workforce</div>
    </footer>
  );
}
