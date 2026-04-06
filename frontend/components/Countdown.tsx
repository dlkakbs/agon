"use client";

import { useEffect, useState, type CSSProperties } from "react";

interface CountdownProps {
  target: number; // unix timestamp (seconds)
  className?: string;
  style?: CSSProperties;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function Countdown({ target, className, style }: CountdownProps) {
  const [diff, setDiff] = useState(0);

  useEffect(() => {
    const updateDiff = () => {
      setDiff(target - Math.floor(Date.now() / 1000));
    };

    updateDiff();
    const timer = setInterval(() => {
      updateDiff();
    }, 1000);
    return () => clearInterval(timer);
  }, [target]);

  if (diff <= 0) return <span className={className} style={style}>Expired</span>;

  const totalHours = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;

  return (
    <span className={className} style={style}>
      {pad(totalHours)}h {pad(m)}m {pad(s)}s
    </span>
  );
}
