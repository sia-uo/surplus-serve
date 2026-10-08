import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CO2_PER_KG_FOOD, KG_PER_MEAL } from '../../../shared/constants';
import type { ImpactStats, Sponsor } from '../../../shared/types';
import { InstallButton } from '../components/Install';
import { Crest } from '../components/Logo';
import { Leaf, VineDivider, VineFlourish } from '../components/Ornaments';
import { ErrorState, LinkButton } from '../components/ui';
import { useI18n, type MessageKey } from '../i18n';
import { homeFor, useAuth } from '../lib/auth';
import { fmtNumber } from '../lib/format';
import { useDocumentTitle, useQuery } from '../lib/hooks';

function CountUp({ value }: { value: number }) {
  const { intl } = useI18n();
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const initial = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1200);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(initial + (value - initial) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fmtNumber(Math.round(shown), intl)}</>;
}

export function SponsorStrip({ sponsors }: { sponsors: Sponsor[] }) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-4">
      {sponsors.map((s) => (
        <li key={s.id}>
          <a
            href={s.website ?? undefined}
            target="_blank"
            rel="noreferrer sponsored"
            className="flex h-20 min-w-40 items-center justify-center gap-3 rounded-2xl border border-gold/40 bg-ivory px-5 transition hover:-translate-y-0.5 hover:border-gold"
            title={s.name}
          >
            {s.logoUrl ? <img src={s.logoUrl} alt={s.name} className="max-h-12 max-w-36 object-contain" loading="lazy" /> : <span className="font-serif text-lg font-bold text-verd">{s.name}</span>}
            {s.tier === 'platinum' && <span className="text-gold-dark" aria-hidden>♛</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function Landing() {
  const { t } = useI18n();
  const { user, config } = useAuth();
  useDocumentTitle('');
  const { data, error, loading, reload } = useQuery<{ stats: ImpactStats; sponsors: Sponsor[] }>('/api/public/stats');
  const cap = config?.packagingCap ?? 15;

  const startRestaurant = user ? homeFor(user.role) : '/login?as=restaurant';
  const startNgo = user ? homeFor(user.role) : '/login?as=ngo';

  const stats: { key: MessageKey; value: number; icon: string }[] = [
    { key: 'stats.meals', value: data?.stats.meals ?? 0, icon: '🍛' },
    { key: 'stats.kg', value: data?.stats.kgSaved ?? 0, icon: '⚖️' },
    { key: 'stats.co2', value: data?.stats.co2Avoided ?? 0, icon: '🌿' },
    { key: 'stats.restaurants', value: data?.stats.restaurants ?? 0, icon: '🍽️' },
    { key: 'stats.ngos', value: data?.stats.ngos ?? 0, icon: '🤝' },
    { key: 'stats.pickups', value: data?.stats.pickups ?? 0, icon: '🔐' },
  ];

  const steps: [MessageKey, MessageKey, string][] = [
    ['how.step1Title', 'how.step1Body', '📝'],
    ['how.step2Title', 'how.step2Body', '📍'],
    ['how.step3Title', 'how.step3Body', '🔐'],
    ['how.step4Title', 'how.step4Body', '📜'],
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:pt-20">
          <div className="animate-rise">
            <p className="heading-eyebrow">{t('landing.eyebrow')}</p>
            <h1 className="mt-4 text-4xl leading-[1.08] font-bold sm:text-5xl lg:text-6xl">
              <span className="gold-text">{t('landing.title')}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ivory/80">{t('landing.subtitle')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton to={startRestaurant} variant="primary" className="px-6 text-base">
                🍽️ {t('landing.ctaRestaurant')}
              </LinkButton>
              <LinkButton to={startNgo} variant="gold" className="px-6 text-base">
                🤝 {t('landing.ctaNgo')}
              </LinkButton>
            </div>
            <div className="mt-4">
              <InstallButton variant="gold-solid" />
            </div>
          </div>
          <div className="relative mx-auto hidden w-full max-w-md sm:block">
            <div className="absolute inset-8 rounded-full bg-gradient-to-br from-leaf/25 via-gold/20 to-vine/30 blur-3xl" aria-hidden />
            <VineFlourish className="absolute -top-10 left-0 h-[26rem] w-auto opacity-90" />
            <VineFlourish flip className="absolute -top-4 right-0 h-[24rem] w-auto opacity-75 [animation-delay:-3s]" />
            <Crest className="relative mx-auto size-72 animate-float drop-shadow-[0_24px_40px_rgba(0,0,0,0.55)] lg:size-80" />
          </div>
        </div>
        <VineDivider className="pb-2" />
      </section>

      {/* Live impact */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6" aria-labelledby="impact-h">
        <div className="mb-6 flex items-center gap-3">
          <span className="relative flex size-3" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-vine opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-vine" />
          </span>
          <h2 id="impact-h" className="text-2xl font-bold text-ivory sm:text-3xl">
            {t('landing.liveImpact')}
          </h2>
        </div>
        {error ? (
          <ErrorState dark message={error} onRetry={reload} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
            {stats.map((s) => (
              <div key={s.key} className="card-dark group relative overflow-hidden p-4 text-center transition hover:-translate-y-1">
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-leaf via-gold to-vine-400" aria-hidden />
                <div className="mx-auto grid size-11 place-items-center rounded-full bg-ivory/10 text-2xl ring-1 ring-gold/30 transition group-hover:scale-110" aria-hidden>
                  {s.icon}
                </div>
                <div className="gold-text mt-1 font-serif text-2xl font-bold sm:text-3xl" aria-live="polite">
                  {loading ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-gold/20 align-middle" /> : <CountUp value={s.value} />}
                </div>
                <div className="mt-1 text-xs text-ivory/70 sm:text-sm">{t(s.key)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <VineDivider />

      {/* How it works */}
      <section id="how" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-14 sm:px-6">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">
          <span className="gold-text">{t('how.title')}</span>
        </h2>
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([title, body, icon], i) => (
            <li key={title} className="card relative p-6 pt-8 transition hover:-translate-y-1">
              <span className="absolute -top-4 left-6 grid size-10 place-items-center rounded-full border-2 border-gold bg-gradient-to-br from-verd-600 to-verd font-serif text-lg font-bold text-gold shadow-lg">{i + 1}</span>
              {i < steps.length - 1 && <Leaf className="absolute top-1/2 -right-4 z-10 hidden size-6 -translate-y-1/2 rotate-45 text-leaf lg:block" />}
              <div className="mt-2 text-3xl" aria-hidden>
                {icon}
              </div>
              <h3 className="mt-3 text-xl font-bold text-verd">{t(title)}</h3>
              <p className="mt-2 text-sm text-ink/80">{t(body)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Benefits */}
      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-2">
        {(
          [
            ['benefits.restaurantsTitle', ['benefits.r1', 'benefits.r2', 'benefits.r3', 'benefits.r4'], '🍽️'],
            ['benefits.ngosTitle', ['benefits.n1', 'benefits.n2', 'benefits.n3', 'benefits.n4'], '🤝'],
          ] as [MessageKey, MessageKey[], string][]
        ).map(([title, items, icon]) => (
          <div key={title} className="card-dark p-7">
            <h2 className="flex items-center gap-3 text-2xl font-bold">
              <span aria-hidden>{icon}</span>
              <span className="gold-text">{t(title)}</span>
            </h2>
            <ul className="mt-5 space-y-3">
              {items.map((k) => (
                <li key={k} className="flex gap-3 text-ivory/90">
                  <Leaf className="mt-1 size-4 shrink-0 text-leaf" />
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* Pricing / model */}
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="card relative overflow-hidden p-8 text-center">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-leaf via-gold to-vine" />
          <h2 className="text-3xl font-bold text-verd">{t('pricing.title')}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-ink/80">{t('pricing.body', { cap })}</p>
          <p className="mt-4 text-xs text-ink/60">{t('impact.methodology', { kg: KG_PER_MEAL, co2: CO2_PER_KG_FOOD })}</p>
        </div>
      </section>

      <VineDivider className="mt-6" />

      {/* Sponsors */}
      <section className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6">
        <h2 className="text-3xl font-bold">
          <span className="gold-text">{t('sponsors.title')}</span>
        </h2>
        <p className="mt-2 text-ivory/75">{t('sponsors.subtitle')}</p>
        <div className="mt-8">
          {data?.sponsors.length ? <SponsorStrip sponsors={data.sponsors} /> : <p className="text-ivory/60 italic">{t('sponsors.none')}</p>}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton to="/sponsor-us" variant="gold">
            {t('sponsors.cta')}
          </LinkButton>
          <LinkButton to="/impact" variant="ghost-dark">
            {t('nav.impact')} →
          </LinkButton>
        </div>
      </section>

      <VineDivider />

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-14 sm:px-6">
        <h2 className="text-center text-3xl font-bold">
          <span className="gold-text">{t('faq.title')}</span>
        </h2>
        <div className="mt-8 space-y-3">
          {([1, 2, 3, 4, 5, 6] as const).map((n) => (
            <details key={n} className="group card overflow-hidden p-0 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 font-semibold text-verd">
                {t(`faq.q${n}` as MessageKey)}
                <span className="text-gold-dark transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="px-5 pb-5 text-ink/80">{t(`faq.a${n}` as MessageKey)}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="relative overflow-hidden rounded-[1.75rem] border border-gold/50 bg-gradient-to-br from-verd-600 via-verd to-vine-700 p-10 text-center shadow-2xl">
          <div className="absolute -top-20 -right-20 size-60 rounded-full bg-vine-400/30 blur-3xl" aria-hidden />
          <div className="absolute -bottom-24 -left-16 size-60 rounded-full bg-leaf/20 blur-3xl" aria-hidden />
          <VineFlourish className="absolute -top-6 left-2 hidden h-72 w-auto opacity-40 md:block" />
          <VineFlourish flip className="absolute -top-6 right-2 hidden h-72 w-auto opacity-40 md:block" />
          <h2 className="relative text-3xl font-bold sm:text-4xl">
            <span className="gold-text">{t('cta.title')}</span>
          </h2>
          <p className="relative mt-3 text-ivory/80">{t('cta.body')}</p>
          <div className="relative mt-6 flex flex-wrap justify-center gap-3">
            <LinkButton to={user ? homeFor(user.role) : '/login'} variant="primary" className="px-8 text-base">
              {user ? t('nav.dashboard') : t('nav.signIn')}
            </LinkButton>
            <Link to="/disclaimer" className="btn btn-ghost-dark">
              {t('footer.disclaimer')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
