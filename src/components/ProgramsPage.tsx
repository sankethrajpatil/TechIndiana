import React from 'react';

type Props = {
  programs: any[];
};

export default function ProgramsPage({ programs }: Props) {
  return (
    <section id="programs" className="py-8">
      <h3 className="text-2xl font-bold mb-4">Programs</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {programs.length === 0 ? (
          <div className="text-white/60">No programs found.</div>
        ) : (
          programs.map((p:any) => (
            <div key={p.programId || p._id} className="bg-white/5 p-4 rounded-lg">
              <div className="font-semibold">{p.name || p.programId}</div>
              <div className="text-xs text-white/60 mt-2">{p.summary || p.description || ''}</div>
              <div className="mt-3">
                <button className="px-3 py-1 bg-orange-600 rounded text-sm">View program</button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
