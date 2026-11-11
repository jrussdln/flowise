import { useState } from "react";
import { SITE } from "../../constants/site";
import { LOGOS } from "../../constants/logos";

/**
 * Main application logo. Pass `mobileSrc` to show a different image below
 * the sm breakpoint.
 * Falls back to initials if the image fails to load.
 */
export default function Logo({
  src = LOGOS.rectangle,
  mobileSrc,
  alt = SITE.name,
  imgClassName = "",
  className = "",
}) {
  const [ok, setOk] = useState(true);

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
      src={src}
      alt={alt}
      className={`w-auto ${imgClassName}`}
      onError={() => setOk(false)}
    />
  );

  return (
    <span className={`flex items-center ${className}`}>
      <span className="logo-shine">
        {mobileSrc ? (
          <picture>
            <source media="(max-width: 639px)" srcSet={mobileSrc} />
            {img}
          </picture>
        ) : (
          img
        )}
      </span>
    </span>
  );
}
