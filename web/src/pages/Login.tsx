import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '../components/Layout';
import { Crest } from '../components/Logo';
import { Alert, Button, Field, Loading } from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/hooks';

export default function Login() {
  const { t } = useI18n();
  const { user, loading, config, refresh } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
  useDocumentTitle(t('nav.signIn'));

  const next = params.get('next') ?? '';
  if (loading) return <Loading dark />;
  if (user) return <Navigate to={user.role ? next || homeFor(user.role) : '/onboarding'} replace />;

  const googleHref = `/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ''}`;

  async function devLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setDevError(null);
    try {
      const res = await api.post<{ role: string | null }>('/api/auth/dev-login', { email });
      await refresh();
      navigate(res.role ? homeFor(res.role) : '/onboarding');
    } catch (err) {
      setDevError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="max-w-md">
      <div className="card animate-rise p-8 text-center">
        <Crest className="mx-auto size-20" />
        <h1 className="mt-4 text-3xl font-bold text-verd">{t('login.title')}</h1>
        <p className="mt-2 text-ink/70">{t('login.subtitle')}</p>
        {params.get('error') && (
          <Alert tone="error" className="mt-5">
            {t('login.error')}
          </Alert>
        )}
        {config?.googleEnabled ? (
          <a href={googleHref} className="btn btn-outline mt-6 w-full border-ink/25 py-3 text-base">
            <svg aria-hidden viewBox="0 0 48 48" className="size-5">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            {t('login.google')}
          </a>
        ) : (
          <Alert tone="warning" className="mt-6">
            {t('login.notConfigured')}
          </Alert>
        )}

        {config?.devLogin && (
          <form onSubmit={devLogin} className="mt-6 space-y-3 rounded-xl border border-dashed border-ink/25 p-4 text-left">
            <p className="text-sm font-semibold text-ink">{t('login.devTitle')}</p>
            <Field label={t('login.devEmail')}>
              {(id) => <input id={id} type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="spice.garden@demo.surplusserve.in" />}
            </Field>
            {devError && <Alert tone="error">{devError}</Alert>}
            <Button type="submit" variant="primary" loading={busy} className="w-full">
              {t('login.devButton')}
            </Button>
          </form>
        )}

        <p className="mt-6 text-xs text-ink/60">
          {t('login.agree')}{' '}
          <Link className="underline" to="/terms">
            {t('footer.terms')}
          </Link>{' '}
          ·{' '}
          <Link className="underline" to="/privacy">
            {t('footer.privacy')}
          </Link>{' '}
          ·{' '}
          <Link className="underline" to="/disclaimer">
            {t('footer.disclaimer')}
          </Link>
        </p>
      </div>
    </Container>
  );
}
