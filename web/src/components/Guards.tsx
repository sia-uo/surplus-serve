import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '../../../shared/types';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { Container } from './Layout';
import { Alert, Card, ErrorState, LinkButton, Loading } from './ui';

/** Gate a route on sign-in and role; shows suspension / onboarding states. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading, error, refresh } = useAuth();
  const location = useLocation();
  const { t } = useI18n();

  if (loading) return <Loading dark />;
  if (error && !user)
    return (
      <Container>
        <ErrorState dark message={error} onRetry={refresh} />
      </Container>
    );
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (user.status === 'suspended')
    return (
      <Container className="max-w-xl">
        <Card>
          <h1 className="font-serif text-2xl font-bold text-vine">{t('status.suspendedTitle')}</h1>
          <p className="mt-2 text-ink/80">{t('status.suspendedBody')}</p>
          {user.suspendedReason && (
            <Alert tone="error" className="mt-4">
              {t('status.reason')}: {user.suspendedReason}
            </Alert>
          )}
        </Card>
      </Container>
    );
  if (!user.role) return <Navigate to="/onboarding" replace />;
  if (!roles.includes(user.role))
    return (
      <Container className="max-w-xl">
        <ErrorState dark message={t('error.forbidden')} />
      </Container>
    );
  return <>{children}</>;
}

/** Shows pending/rejected verification and missing-profile banners for restaurants and NGOs. */
export function VerificationBanner() {
  const { user, restaurant, ngo } = useAuth();
  const { t } = useI18n();
  const profile = user?.role === 'restaurant' ? restaurant : user?.role === 'ngo' ? ngo : null;
  const profilePath = user?.role === 'restaurant' ? '/restaurant/profile' : '/ngo/profile';
  if (!user || user.role === 'admin') return null;
  if (!profile)
    return (
      <Alert tone="warning" className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <span>
          <strong>{t('status.incompleteTitle')}.</strong> {t('status.incompleteBody')}
        </span>
        <LinkButton to={profilePath} variant="primary" className="min-h-9 py-1.5">
          {t('status.fixProfile')}
        </LinkButton>
      </Alert>
    );
  if (profile.verification === 'pending')
    return (
      <Alert tone="warning" className="mb-6">
        <strong>⏳ {t('status.pendingTitle')}.</strong> {user.role === 'restaurant' ? t('status.pendingRestaurant') : t('status.pendingNgo')}
      </Alert>
    );
  if (profile.verification === 'rejected')
    return (
      <Alert tone="error" className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <span>
          <strong>{t('status.rejectedTitle')}.</strong> {profile.rejectionReason && `${t('status.reason')}: ${profile.rejectionReason}`}
        </span>
        <LinkButton to={profilePath} variant="primary" className="min-h-9 py-1.5">
          {t('status.fixProfile')}
        </LinkButton>
      </Alert>
    );
  return null;
}
