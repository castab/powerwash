export default function Loading() {
  return (
    <div className="shell py-8">
      <div className="surface-block animate-pulse">
        <div className="h-5 w-32 rounded-full bg-white/70" />
        <div className="mt-4 h-8 w-72 max-w-full rounded-full bg-white/70" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="h-48 rounded-[24px] bg-white/50" />
          <div className="h-48 rounded-[24px] bg-white/50" />
        </div>
      </div>
    </div>
  );
}
