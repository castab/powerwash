export default function Loading() {
  return (
    <div className="shell py-8">
      <div className="panel animate-pulse p-6">
        <div className="h-5 w-36 rounded-full bg-slate-200" />
        <div className="mt-4 h-10 w-72 rounded-2xl bg-slate-200" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="h-48 rounded-3xl bg-slate-100" />
          <div className="h-48 rounded-3xl bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
