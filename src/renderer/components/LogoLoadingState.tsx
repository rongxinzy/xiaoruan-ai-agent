import { useId } from 'react';

interface LogoLoadingStateProps {
  label: string;
}

/** Content-area loading only; readiness never waits for an animation cycle. */
export function LogoLoadingState({ label }: LogoLoadingStateProps) {
  const colorId = `${useId().replace(/:/g, '')}-color`;

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div aria-hidden="true">
        <svg viewBox="0 0 1050 300" className="theme-logo-loading-mark">
          <defs>
            <filter id={colorId} colorInterpolationFilters="sRGB">
              {/* Remove the brand image's white tile before coloring its silhouette. */}
              <feColorMatrix
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1 -1 -1 0 2.9"
                result="silhouette"
              />
              <feFlood floodColor="currentColor" result="color" />
              <feComposite in="color" in2="silhouette" operator="in" result="tinted" />
              <feComposite in="tinted" in2="SourceAlpha" operator="in" />
            </filter>
          </defs>
          <image
            href="xiaoruan-logo-light-1600.png"
            width="1600"
            height="300"
            filter={`url(#${colorId})`}
          />
          <circle cx="1024" cy="72" r="16" fill="currentColor" className="theme-logo-loading-dot" />
        </svg>
      </div>
      <p className="theme-logo-loading-label text-center">{label}</p>
    </div>
  );
}
