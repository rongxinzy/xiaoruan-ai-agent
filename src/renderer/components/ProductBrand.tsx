import { i18nService } from '../services/i18n';

/** Shared product identity for the shell, welcome screen and About page. */
export function ProductBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact ? 'flex min-w-0 items-center gap-2' : 'flex flex-col items-center gap-4 text-center'
      }
      aria-label={i18nService.t('appTitle')}
    >
      <img
        src="xiaoruan-mark.png"
        alt=""
        draggable={false}
        className={
          compact ? 'size-8 shrink-0 rounded-md select-none' : 'size-20 rounded-xl select-none'
        }
      />
      {compact ? (
        <div className="min-w-0" title={i18nService.t('appTitle')}>
          {/* Fixed artwork color from the logo's gold; brand marks do not follow theme accents. */}
          <p className="text-sm font-semibold leading-4" style={{ color: '#b58b49' }}>
            {i18nService.t('brandCompactName')}
          </p>
          <p className="truncate text-xs leading-4 text-muted-foreground">
            {i18nService.t('brandCompactPurpose')}
          </p>
        </div>
      ) : (
        <p className="text-xl font-semibold text-foreground">{i18nService.t('appTitle')}</p>
      )}
    </div>
  );
}
