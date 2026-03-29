import React from 'react';

type Persona = any;

type Props = {
  personas: Persona[];
  onSelect: (persona: string) => void;
};

export default function PersonaCards({ personas, onSelect }: Props) {
  return (
    <section className="py-8">
      <h3 className="text-2xl font-bold mb-4">Who are you?</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {personas.length === 0 ? (
          <div className="text-white/60">No personas available.</div>
        ) : (
          personas.map((p:any) => (
            <div key={p.persona || p._id} className="bg-white/5 p-4 rounded-lg">
              <div className="font-semibold">{p.displayName || p.persona}</div>
              <div className="text-xs text-white/60 mt-2">{p.description || ''}</div>
              <div className="mt-4">
                <button onClick={() => onSelect(p.persona || p.displayName)} className="px-3 py-1 bg-orange-600 rounded text-sm">Start as {p.displayName || p.persona}</button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
