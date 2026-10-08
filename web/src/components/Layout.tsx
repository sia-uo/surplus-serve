import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LOCALES, type Locale } from '../../../shared/constants';
import { LOCALE_LABELS, useI18n, type MessageKey } from '../i18n';
import { api } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
import { useOnline } from '../lib/hooks';
import { InstallButton } from './Install';
import { Logo } from './Logo';
import { cx } from './ui';

function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const { user } = useAuth();
  return (
    <label className={cx('relative inline-flex items-center', className)}>
      <span className="sr-only">{t('lang.label')}</span>
      <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-3 size-4 text-leaf" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
      </svg>
      <select
        value={locale}
        onChange={(e) => {
          const l = e.target.value as Locale;
          setLocale(l);
          if (user) void api.patch('/api/me/locale', { locale: l }).catch(() => undefined);
        }}
        className="min-h-10 cursor-pointer appearance-none rounded-full border border-leaf/50 bg-verd-800 py-1.5 pr-4 pl-8 text-sm text-ivory hover:border-leaf focus:outline-none"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

function navFor(role: string | null | undefined): { to: string; key: MessageKey; end?: boolean }[] {
  if (role === 'restaurant')
    return [
      { to: '/restaurant', key: 'nav.dashboard', end: true },
      { to: '/restaurant/new', key: 'nav.postFood' },
      { to: '/restaurant/recurring', key: 'nav.recurring' },
      { to: '/restaurant/impact', key: 'nav.myImpact' },
      { to: '/restaurant/premium', key: 'nav.premium' },
      { to: '/restaurant/profile', key: 'nav.profile' },
    ];
  if (role === 'ngo')
    return [
      { to: '/ngo', key: 'nav.findFood', end: true },
      { to: '/ngo/claims', key: 'nav.myClaims' },
      { to: '/ngo/profile', key: 'nav.profile' },
    ];
  if (role === 'admin') return [{ to: '/admin', key: 'nav.admin' }];
  return [
    { to: '/#how', key: 'nav.howItWorks' },
    { to: '/impact', key: 'nav.impact' },
    { to: '/sponsor-us', key: 'nav.sponsorUs' },
    { to: '/#faq', key: 'nav.faq' },
  ];
}

function Header() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const items = navFor(user?.role);

  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cx('rounded-full px-3 py-2 text-sm font-medium whitespace-nowrap transition', isActive ? 'bg-leaf/15 text-leaf' : 'text-ivory/85 hover:text-leaf');

  const authButtons = user ? (
    <button
      className="btn btn-ghost-dark"
      onClick={async () => {
        await signOut();
        navigate('/');
      }}
    >
      {t('nav.signOut')}
    </button>
  ) : (
    <Link to="/login" className="btn btn-primary">
      {t('nav.signIn')}
    </Link>
  );

  return (
    <header className="no-print sticky top-0 whitespace-nowrap z-[900] bg-verd/85 shadow-[0_1px_0_rgb(143_191_108/0.3),0_10px_30px_-20px_rgb(0_0_0/0.8)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo to={user?.role ? homeFor(user.role) : '/'} />
        <nav className="hidden items-center gap-1 xl:flex" aria-label="Main">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={i.to.includes('#') ? linkClass({ isActive: false }) : linkClass}>
              {t(i.key)}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-2 xl:flex">
          <InstallButton className="min-h-10 py-1.5" />
          <LanguageSwitcher />
          {authButtons}
        </div>
        <button
          className="btn btn-ghost-dark -mr-2 xl:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={t('nav.menu')}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden className="text-xl text-leaf">
            {open ? '✕' : '☰'}
          </span>
        </button>
      </div>
      {open && (
        <div id="mobile-nav" className="animate-rise border-t border-leaf/20 bg-verd px-4 pt-2 pb-5 xl:hidden">
          <nav className="flex flex-col gap-1" aria-label="Main">
            {items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} className={i.to.includes('#') ? linkClass({ isActive: false }) : linkClass}>
                {t(i.key)}
              </NavLink>
            ))}
          </nav>
          <div className="leaf-rule my-4" />
          <div className="flex flex-wrap items-center gap-2">
            <LanguageSwitcher />
            <InstallButton />
            {authButtons}
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="no-print relative mt-20 border-t border-leaf/25 bg-gradient-to-b from-verd-950/40 to-verd-950/90">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-ivory/70">{t('footer.tagline')}</p>
        </div>
        <nav className="grid grid-cols-2 gap-2 text-sm" aria-label="Footer">
          <Link className="text-ivory/80 hover:text-leaf" to="/impact">{t('nav.impact')}</Link>
          <Link className="text-ivory/80 hover:text-leaf" to="/sponsor-us">{t('nav.sponsorUs')}</Link>
          <Link className="text-ivory/80 hover:text-leaf" to="/terms">{t('footer.terms')}</Link>
          <Link className="text-ivory/80 hover:text-leaf" to="/privacy">{t('footer.privacy')}</Link>
          <Link className="text-ivory/80 hover:text-leaf" to="/disclaimer">{t('footer.disclaimer')}</Link>
          <a className="text-ivory/80 hover:text-leaf" href="https://github.com/sia-uo/surplus-serve" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <div className="text-sm text-ivory/60">
          <p className="rounded-xl border border-leaf/30 p-3 text-ivory/75">⚖️ {t('footer.disclaimerShort')}</p>
          <p className="mt-3">© {new Date().getFullYear()} SurplusServe · {t('footer.rights')}</p>
        </div>
      </div>
    </footer>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  const { t } = useI18n();
  if (online) return null;
  return (
    <div role="status" className="no-print bg-vine px-4 py-2 text-center text-sm font-medium text-white">
      {t('common.offline')}
    </div>
  );
}

export function Layout() {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo(0, 0);
    }
  }, [hash, pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only rounded bg-leaf px-3 py-2 text-verd focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[1000]">
        Skip to content
      </a>
      <OfflineBanner />
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10', className)}>{children}</div>;
}
