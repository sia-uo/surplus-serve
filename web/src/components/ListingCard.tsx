import type { ReactNode } from 'react';
import { formatDistance } from '../../../shared/geo';
import type { Listing } from '../../../shared/types';
import { useI18n, type MessageKey } from '../i18n';
import { fmtDateTime, fmtTime } from '../lib/format';
import { Badge, cx } from './ui';

export const FOOD_BADGE: Record<string, { tone: 'green' | 'red' | 'gold'; icon: string }> = {
  veg: { tone: 'green', icon: '🟢' },
  nonveg: { tone: 'red', icon: '🔺' },
  jain: { tone: 'gold', icon: '✳️' },
};

export function FoodTypeBadge({ type }: { type: string }) {
  const { t } = useI18n();
  const b = FOOD_BADGE[type] ?? FOOD_BADGE.veg;
  return <Badge tone={b.tone}>{t(`food.${type}` as MessageKey)}</Badge>;
}

export function ListingStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const tone = status === 'active' ? 'green' : status === 'claimed' ? 'gold' : status === 'completed' ? 'navy' : 'gray';
  return <Badge tone={tone}>{t(`listing.${status}` as MessageKey)}</Badge>;
}

export function PartnerBadge() {
  const { t } = useI18n();
  return (
    <Badge tone="gold" className="shadow-sm">
      ♛ {t('card.partner')}
    </Badge>
  );
}

export function ListingCard({ listing: l, actions, showStatus, onSelect, highlighted }: { listing: Listing; actions?: ReactNode; showStatus?: boolean; onSelect?: () => void; highlighted?: boolean }) {
  const { t, intl } = useI18n();
  return (
    <article
      id={`listing-${l.id}`}
      className={cx('card flex animate-rise flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-xl', l.urgent && 'ring-2 ring-crimson/70', highlighted && 'ring-2 ring-gold')}
    >
      {l.photoUrl && (
        <button type="button" onClick={onSelect} className="block aspect-[16/9] w-full overflow-hidden bg-ivory-200" tabIndex={-1}>
          <img src={l.photoUrl} alt="" loading="lazy" className="size-full object-cover" />
        </button>
      )}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {l.urgent && (
            <Badge tone="red" className="animate-pulse-soft">
              ⏱ {t('card.urgent')}
            </Badge>
          )}
          <FoodTypeBadge type={l.foodType} />
          {showStatus && <ListingStatusBadge status={l.status} />}
          {l.restaurantPremium && <PartnerBadge />}
          {l.distanceKm !== undefined && <Badge tone="outline">{t('card.away', { d: formatDistance(l.distanceKm) })}</Badge>}
        </div>
        <div>
          <h3 className="font-serif text-xl leading-snug font-bold text-navy">{l.title}</h3>
          <p className="text-sm text-ink/70">
            {l.restaurantName}
            {l.restaurantQuality ? <span className="ml-2 text-gold-dark">★ {t('card.quality', { score: l.restaurantQuality })}</span> : null}
          </p>
        </div>
        {l.description && <p className="line-clamp-2 text-sm text-ink/80">{l.description}</p>}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm text-ink">
          <div className="col-span-2 flex items-center gap-2">
            <dt className="sr-only">{t('common.servings')}</dt>
            <dd className="font-semibold">🍛 {t('card.left', { n: l.servingsRemaining, total: l.servingsTotal })}</dd>
          </div>
          <div className={cx('col-span-2', l.urgent && 'font-semibold text-crimson')}>⏳ {t('card.safeUntil', { time: fmtDateTime(l.safeUntil, intl) })}</div>
          <div className="col-span-2">🕒 {t('card.pickup', { from: fmtTime(l.pickupStart, intl), to: fmtTime(l.pickupEnd, intl) })}</div>
          <div className="col-span-2 text-ink/75">📦 {l.packagingCost > 0 ? t('card.packaging', { n: l.packagingCost }) : t('card.freePackaging')}</div>
        </dl>
        {l.allergens.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {l.allergens.map((a) => (
              <span key={a} className="badge border border-crimson/30 text-crimson-700">
                ⚠ {t(`allergen.${a}` as MessageKey)}
              </span>
            ))}
          </div>
        )}
        {actions && <div className="mt-auto flex flex-wrap gap-2 pt-2">{actions}</div>}
      </div>
    </article>
  );
}
