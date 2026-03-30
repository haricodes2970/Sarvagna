import { useEffect, useState } from "react";
import { Star, Award } from "lucide-react";

interface XPToastProps {
  xp: number;
  badgeName?: string;
  onDismiss: () => void;
}

export default function XPToast({ xp, badgeName, onDismiss }: XPToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const show = setTimeout(() => setVisible(true), 50);
    // Auto-dismiss after 3s
    const hide = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 3000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [onDismiss]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex flex-col gap-2 transition-all duration-300
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
    >
      {/* XP gained */}
      <div className="flex items-center gap-2.5 bg-zinc-900 border border-amber-500/30 rounded-2xl px-4 py-3 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
          <Star size={16} className="text-amber-500 fill-amber-500" />
        </div>
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">XP Earned</p>
          <p className="text-lg font-black text-amber-500 leading-none">+{xp} XP</p>
        </div>
      </div>

      {/* Badge unlocked (conditional) */}
      {badgeName && (
        <div className="flex items-center gap-2.5 bg-zinc-900 border border-emerald-500/30 rounded-2xl px-4 py-3 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Award size={16} className="text-emerald-500" />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Badge Unlocked</p>
            <p className="text-sm font-black text-emerald-400 leading-none">{badgeName}</p>
          </div>
        </div>
      )}
    </div>
  );
}
