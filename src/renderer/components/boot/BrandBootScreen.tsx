import { useEffect, useRef, useState } from 'react';

import { cn } from '@shared/lib/utils';
import { i18nService } from '../../services/i18n';
import { ProductBrand } from '../ProductBrand';

interface BrandBootScreenProps {
  exiting: boolean;
  onExitComplete: () => void;
}

/** Initialization owns the splash lifetime; branding never adds a minimum wait. */
export function BrandBootScreen({ exiting, onExitComplete }: BrandBootScreenProps) {
  const onExitCompleteRef = useRef(onExitComplete);
  useEffect(() => {
    onExitCompleteRef.current = onExitComplete;
  }, [onExitComplete]);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setReducedMotion(query.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => onExitCompleteRef.current(), reducedMotion ? 0 : 200);
    return () => window.clearTimeout(timer);
  }, [exiting, reducedMotion]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-0 flex-1 flex-col items-center justify-center gap-6 bg-background px-6 transition-opacity duration-200 ease-out motion-reduce:transition-none',
        exiting ? 'opacity-0' : 'opacity-100',
      )}
    >
      <div className="motion-safe:animate-fade-in-up">
        <ProductBrand />
      </div>
      <p className="text-sm text-muted-foreground">{i18nService.t('brandStarting')}</p>
    </div>
  );
}
