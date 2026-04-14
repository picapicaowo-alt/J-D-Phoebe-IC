import { cn } from "@/lib/utils";

type RadarPoint = { label: string; value: number };

type Props = {
  points: RadarPoint[];
  className?: string;
};

export function AbilityRadar({ points, className }: Props) {
  const size = 220;
  const center = size / 2;
  const maxR = 84;
  const levels = [0.25, 0.5, 0.75, 1];

  const toPolar = (idx: number, value: number) => {
    const angle = (-Math.PI / 2) + (idx * 2 * Math.PI) / points.length;
    const r = (Math.max(0, Math.min(100, value)) / 100) * maxR;
    return {
      x: center + Math.cos(angle) * r,
      y: center + Math.sin(angle) * r,
    };
  };

  const polygon = points.map((p, i) => {
    const { x, y } = toPolar(i, p.value);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className={cn("rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4", className)}>
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-[220px] w-[220px]">
        {levels.map((lvl) => {
          const ring = points.map((_, i) => {
            const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / points.length;
            const r = maxR * lvl;
            return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
          }).join(" ");
          return <polygon key={lvl} points={ring} fill="none" stroke="hsl(var(--border))" strokeWidth="1" />;
        })}

        {points.map((_, i) => {
          const edge = toPolar(i, 100);
          return <line key={i} x1={center} y1={center} x2={edge.x} y2={edge.y} stroke="hsl(var(--border))" strokeWidth="1" />;
        })}

        <polygon points={polygon} fill="hsl(var(--accent) / 0.25)" stroke="hsl(var(--accent))" strokeWidth="2" />

        {points.map((p, i) => {
          const labelPos = toPolar(i, 112);
          return (
            <text key={p.label} x={labelPos.x} y={labelPos.y} textAnchor="middle" fontSize="10" fill="hsl(var(--muted))">
              {p.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
