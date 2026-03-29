import React from 'react';

type Props = {
  personaBundle: any;
};

export default function PersonaPage({ personaBundle }: Props) {
  if (!personaBundle) return <div className="text-white/60">Select a persona to view the journey.</div>;

  return (
    <section className="py-8">
      <h3 className="text-2xl font-bold mb-4">Personalized Journey: {personaBundle.persona}</h3>
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-white/5 p-4 rounded">
          <h4 className="font-semibold">Journeys</h4>
          <div className="text-sm mt-2">
            {personaBundle.journeys?.length ? (
              personaBundle.journeys.map((j:any, i:number) => (
                <div key={i} className="py-2 border-b border-white/5">
                  <div className="font-semibold">{j.title || j.name || 'Untitled'}</div>
                  <div className="text-xs text-white/60">{j.steps ? `${j.steps.length} steps` : ''}</div>
                </div>
              ))
            ) : (
              <div className="text-white/60">No journeys available.</div>
            )}
          </div>
        </div>

        <div className="bg-white/5 p-4 rounded">
          <h4 className="font-semibold">Questions</h4>
          <div className="text-sm mt-2">
            {personaBundle.questions?.length ? (
              personaBundle.questions.map((q:any, i:number) => (
                <div key={i} className="py-1">{q.question || q.text || JSON.stringify(q).slice(0,80)}</div>
              ))
            ) : (
              <div className="text-white/60">No questions available.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
