interface SubjectSlotBarProps {
  used: number;
  max?: number;
}

export default function SubjectSlotBar({ used, max = 10 }: SubjectSlotBarProps) {
  const isNearLimit = used >= 9;
  const isAtLimit = used >= max;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500 font-medium uppercase tracking-widest text-[10px]">Subject Slots</span>
        <span className={`font-black ${isAtLimit ? "text-red-500" : isNearLimit ? "text-orange-400" : "text-amber-500"}`}>
          {used}/{max}
        </span>
      </div>

      <div className="flex gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300
              ${i < used
                ? isAtLimit
                  ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                  : isNearLimit
                  ? "bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.4)]"
                  : "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.3)]"
                : "bg-zinc-800"
              }`}
          />
        ))}
      </div>

      {isAtLimit && (
        <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">
          Subject limit reached — remove one to add more
        </p>
      )}
    </div>
  );
}
