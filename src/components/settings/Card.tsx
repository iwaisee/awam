export default function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-8 ${className}`}
    >
      {children}
    </div>
  );
}
