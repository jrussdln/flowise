import { useEffect, useRef } from "react";

export default function GalaxyBackground({ className = "" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let particles = [];
    let last = 0;

    const COLORS = [
      { r: 96, g: 165, b: 250 },
      { r: 59, g: 130, b: 246 },
      { r: 147, g: 197, b: 253 },
      { r: 191, g: 219, b: 254 },
      { r: 255, g: 255, b: 255 },
    ];

    const BASE_VX = 0.25;
    const BASE_VY = -0.12;

    const makeParticle = () => {
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const big = Math.random() < 0.12;
      const speed = big ? 0.35 : 0.8;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: BASE_VX * speed + (Math.random() - 0.5) * 0.6 * speed,
        vy: BASE_VY * speed + (Math.random() - 0.5) * 0.6 * speed,
        radius: big ? 1.6 + Math.random() * 1.8 : 0.5 + Math.random() * 1.2,
        alpha: 0.3 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        twinkle: 0.0015 + Math.random() * 0.0035,
        glow: big,
        color,
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.round(rect.width || window.innerWidth));
      height = Math.max(1, Math.round(rect.height || window.innerHeight));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const target = Math.min(
        180,
        Math.max(70, Math.round((width * height) / 11000))
      );
      while (particles.length < target) particles.push(makeParticle());
      particles.length = target;
    };

    const draw = (t) => {
      const dt = last ? Math.min((t - last) / 16.67, 3) : 1;
      last = t;

      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (p.x < -5) p.x = width + 5;
        else if (p.x > width + 5) p.x = -5;
        if (p.y < -5) p.y = height + 5;
        else if (p.y > height + 5) p.y = -5;

        const twinkle = 0.5 + 0.5 * Math.sin(t * p.twinkle + p.phase);
        const a = p.alpha * twinkle;
        const { r, g, b } = p.color;

        if (p.glow) {
          ctx.save();
          ctx.shadowBlur = 14;
          ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      particles = [];
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none block ${className}`}
    />
  );
}
