export default function Loading() {
  return (
    <div className="shell py-8">
      <div className="panel animate-pulse p-6">
        <div className="h-5 w-32 rounded-full bg-surface" />
        <div className="mt-4 h-8 w-72 rounded-full bg-surface" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="h-48 rounded-[24px] bg-surface" />
          <div className="h-48 rounded-[24px] bg-surface" />
        </div>
      </div>
    </div>
  );
}
