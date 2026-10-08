import { useParams } from 'react-router-dom';
import type { ImpactStats, Sponsor } from '../../../shared/types';
import { Container } from '../components/Layout';
import { PartnerBadge } from '../components/ListingCard';
import { ErrorState, LinkButton, Loading, PageHeader, StatCard } from '../components/ui';
import { useI18n } from '../i18n';
import { fmtNumber } from '../lib/format';
import { useDocumentTitle, useQuery } from '../lib/hooks';
import { SponsorStrip } from './Landing';

interface CityData {
  city: string;
  label: string;
  stats: ImpactStats;
  sponsors: Sponsor[];
  topRestaurants: { name: string; premium: boolean; meals: number }[];
}

export default function CityImpact() {
  const { city = '' } = useParams();
  const { t, intl } = useI18n();
  const { data, error, loading, reload } = useQuery<CityData>(`/api/public/city/${encodeURIComponent(city)}`);
  useDocumentTitle(data ? t('city.title', { city: data.label }) : t('city.allCities'));

  if (loading) return <Loading dark />;
  if (error || !data)
    return (
      <Container>
        <ErrorState dark message={error} onRetry={reload} />
      </Container>
    );

  return (
    <Container>
      <PageHeader eyebrow={t('nav.impact')} title={t('city.title', { city: data.label })} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard dark icon="🍛" label={t('stats.meals')} value={fmtNumber(data.stats.meals, intl)} />
        <StatCard dark icon="⚖️" label={t('stats.kg')} value={fmtNumber(data.stats.kgSaved, intl)} />
        <StatCard dark icon="🌿" label={t('stats.co2')} value={fmtNumber(data.stats.co2Avoided, intl)} />
        <StatCard dark icon="🔐" label={t('stats.pickups')} value={fmtNumber(data.stats.pickups, intl)} />
      </div>

      <section className="mt-12 text-center">
        <h2 className="text-2xl font-bold sm:text-3xl">
          <span className="gold-text">{t('city.supportedBy', { city: data.label })}</span>
        </h2>
        <div className="mt-6">
          {data.sponsors.length ? (
            <SponsorStrip sponsors={data.sponsors} />
          ) : (
            <div className="space-y-4">
              <p className="text-ivory/70 italic">{t('city.noSponsors', { city: data.label })}</p>
              <LinkButton to="/sponsor-us" variant="gold">
                {t('sponsors.cta')}
              </LinkButton>
            </div>
          )}
        </div>
      </section>

      {data.topRestaurants.length > 0 && (
        <section className="mx-auto mt-12 max-w-2xl">
          <h2 className="mb-4 text-center text-2xl font-bold text-gold">{t('city.topRestaurants')}</h2>
          <ol className="card divide-y divide-ink/10 p-0">
            {data.topRestaurants.map((r, i) => (
              <li key={r.name + i} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="flex flex-wrap items-center gap-2 font-medium text-navy">
                  <span className="font-serif text-gold-dark">{i + 1}.</span> {r.name} {r.premium && <PartnerBadge />}
                </span>
                <span className="text-sm whitespace-nowrap text-ink/70">{t('city.meals', { n: fmtNumber(r.meals, intl) })}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-center text-xs text-ivory/60">{t('city.anonymous')}</p>
        </section>
      )}
    </Container>
  );
}
