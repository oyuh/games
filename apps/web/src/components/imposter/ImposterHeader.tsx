export function ImposterHeader({ code }: { code: string }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="gradient-heading text-2xl font-bold uppercase tracking-widest">Imposter</h1>
      <span className="badge">Code: {code}</span>
    </div>
  );
}
