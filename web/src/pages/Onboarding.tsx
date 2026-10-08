import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '../components/Layout';
import { NgoProfileForm, RestaurantProfileForm } from '../components/ProfileForms';
import { Alert, Button, Card, cx, Loading, PageHeader } from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/hooks';

export default function Onboarding() {
  const { t } = useI18n();
  const { user, loading, restaurant, ngo, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [choice, setChoice] = useState<'restaurant' | 'ngo' | null>(params.get('as') === 'ngo' ? 'ngo' : params.get('as') === 'restaurant' ? 'restaurant' : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle(t('onboarding.title'));

  if (loading) return <Loading dark />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'restaurant' && restaurant) return <Navigate to="/restaurant" replace />;
  if (user.role === 'ngo' && ngo) return <Navigate to="/ngo" replace />;

  async function chooseRole() {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/me/role', { role: choice });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="max-w-3xl">
      <PageHeader eyebrow="SurplusServe" title={t('onboarding.title')} />
      {!user.role ? (
        <Card>
          <h2 className="font-serif text-xl font-bold text-verd">{t('onboarding.chooseRole')}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2" role="radiogroup">
            {(
              [
                ['restaurant', '🍽️', t('onboarding.restaurant'), t('onboarding.restaurantDesc')],
                ['ngo', '🤝', t('onboarding.ngo'), t('onboarding.ngoDesc')],
              ] as const
            ).map(([value, icon, label, desc]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={choice === value}
                onClick={() => setChoice(value)}
                className={cx(
                  'rounded-2xl border-2 p-5 text-left transition',
                  choice === value ? 'border-vine bg-vine/5 shadow-lg' : 'border-ink/15 bg-white hover:border-leaf-dark',
                )}
              >
                <span className="text-4xl" aria-hidden>
                  {icon}
                </span>
                <span className="mt-3 block font-serif text-xl font-bold text-verd">{label}</span>
                <span className="mt-1 block text-sm text-ink/70">{desc}</span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink/60">{t('onboarding.roleNote')}</p>
          {error && (
            <Alert tone="error" className="mt-4">
              {error}
            </Alert>
          )}
          <Button className="mt-5" disabled={!choice} loading={busy} onClick={chooseRole}>
            {t('common.next')} →
          </Button>
        </Card>
      ) : (
        <Card>
          <h2 className="mb-5 font-serif text-xl font-bold text-verd">{t('onboarding.profileTitle')}</h2>
          {user.role === 'restaurant' ? (
            <RestaurantProfileForm initial={null} onSaved={() => navigate(homeFor('restaurant'))} />
          ) : (
            <NgoProfileForm initial={null} onSaved={() => navigate(homeFor('ngo'))} />
          )}
        </Card>
      )}
    </Container>
  );
}
