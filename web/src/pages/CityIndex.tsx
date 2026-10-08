import { Link } from 'react-router-dom';
import { Container } from '../components/Layout';
import { EmptyState, ErrorState, Loading, PageHeader } from '../components/ui';
import { useI18n } from '../i18n';
import { fmtNumber } from '../lib/format';
import { useDocumentTitle, useQuery } from '../lib/hooks';

export default function CityIndex() {
  const { t, intl } = useI18n();
  useDocumentTitle(t('city.allCities'));
  const { data, error, loading, reload } = useQuery<{ items: { city: string; label: string; meals: number }[] }>('/api/public/cities');
  return (
    <Container>
      <PageHeader title={t('city.allCities')} subtitle={t('city.allCitiesSubtitle')} />
      {loading ? (
        <Loading dark />
      ) : error ? (
        <ErrorState dark message={error} onRetry={reload} />
      ) : !data?.items.length ? (
        <EmptyState dark title={t('city.noCities')} icon="🏙️" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((c) => (
            <li key={c.city}>
              <Link to={`/impact/${encodeURIComponent(c.city)}`} className="card block p-6 transition hover:-translate-y-0.5 hover:shadow-xl">
                <span className="font-serif text-2xl font-bold text-verd">{c.label}</span>
                <span className="mt-1 block text-leaf-dark">{t('city.meals', { n: fmtNumber(c.meals, intl) })} →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
