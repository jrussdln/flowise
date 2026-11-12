import { useState } from "react";
import { SITE } from "../../constants/site";
import { useTheme } from "../../hooks/useTheme.js";
import { LOGOS } from "../../constants/logos";

/**
 * Main application logo. `variant` picks the asset set — "logo" (full
 * wordmark, default) or "icon" (square icon) — and the theme picks the
 * colour (dark logo on the dark theme, light logo on the light theme);
 * pass `src` to override both. Falls back to initials if the image fails
 * to load.
 */
export default function Logo({
  variant = "logo",
  src,
  alt = SITE.name,
  imgClassName = "",
  className = "",
}) {
  const [ok, setOk] = useState(true);
  const { theme } = useTheme();
  const set = LOGOS[variant] || LOGOS.logo;
  const resolved = src || set[theme] || set.light;

  if (!ok) {
    return (
      <span className={`flex items-center ${className}`}>
        <span className="text-base lg:text-lg font-bold tracking-widest text-[var(--text-primary)]">
          {SITE.initials}
        </span>
      </span>
    );
  }

  const img = (
    <img
      src={resolved}
      alt={alt}
      className={`w-auto ${imgClassName}`}
      onError={() => setOk(false)}
    />
  );

  return (
    <span className={`flex items-center ${className}`}>
      <span className="logo-shine">{img}</span>
    </span>
  );
}
