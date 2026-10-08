import { CO2_PER_KG_FOOD, KG_PER_MEAL } from '../../../../shared/constants';
import { Container } from '../../components/Layout';
import { ErrorState, LinkButton, Loading, PageHeader, StatCard } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { fmtNumber } from '../../lib/format';
import { useDocumentTitle, useQuery } from '../../lib/hooks';

interface ImpactData {
  meals: number;
  kgSaved: number;
  co2Avoided: number;
  pickups: number;
  ngosServed: number;
  listings: number;
}

export default function RestaurantImpact() {
  const { t, intl } = useI18n();
  const { restaurant } = useAuth();
  useDocumentTitle(t('impact.title'));
  const { data, error, loading, reload } = useQuery<ImpactData>('/api/restaurant/impact');

  return (
    <Container>
      <PageHeader eyebrow={restaurant?.name} title={t('impact.title')} subtitle={t('impact.subtitle')} />
      {loading ? (
        <Loading dark />
      ) : error || !data ? (
        <ErrorState dark message={error} onRetry={reload} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatCard dark icon="🍛" label={t('impact.meals')} value={fmtNumber(data.meals, intl)} />
            <StatCard dark icon="⚖️" label={t('impact.kg')} value={fmtNumber(data.kgSaved, intl)} />
            <StatCard dark icon="🌿" label={t('impact.co2')} value={fmtNumber(data.co2Avoided, intl)} />
            <StatCard dark icon="🔐" label={t('impact.pickups')} value={fmtNumber(data.pickups, intl)} />
            <StatCard dark icon="🤝" label={t('impact.ngosServed')} value={fmtNumber(data.ngosServed, intl)} />
            <StatCard dark icon="📝" label={t('impact.listings')} value={fmtNumber(data.listings, intl)} />
          </div>
          <p className="mt-6 text-sm text-ivory/60">{t('impact.methodology', { kg: KG_PER_MEAL, co2: CO2_PER_KG_FOOD })}</p>
          {!restaurant?.premium && (
            <div className="card-dark mt-8 flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <p className="font-serif text-xl font-bold text-gold">♛ {t('premium.badge')}</p>
                <p className="text-sm text-ivory/75">{t('premium.f1')} · {t('premium.f2')}</p>
              </div>
              <LinkButton to="/restaurant/premium" variant="gold">
                {t('nav.premium')} →
              </LinkButton>
            </div>
          )}
        </>
      )}
    </Container>
  );
}
