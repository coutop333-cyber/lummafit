import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

export default function CountdownBanner() {
  const [timeLeft, setTimeLeft] = useState(600);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const id = setInterval(() => setTimeLeft((p) => p - 1), 1000);
    return () => clearInterval(id);
  }, [timeLeft]);

  const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const s = (timeLeft % 60).toString().padStart(2, '0');

  return (
    <div className="countdown-banner">
      <span className="uppercase tracking-wider truncate">Oferta Relâmpago Termina em:</span>
      <div className="flex items-center gap-1.5 font-bold tabular-nums bg-black/10 px-2 py-0.5 rounded shrink-0">
        <Clock className="w-4 h-4" />
        <span>{m}:{s}</span>
      </div>
    </div>
  );
}
