import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'gold' | 'gold-solid' | 'ghost' | 'ghost-dark' | 'outline';

export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button className={cx('btn', `btn-${variant}`, className)} disabled={loading || rest.disabled} aria-busy={loading || undefined} {...rest}>
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small, className }: { small?: boolean; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cx('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', small ? 'size-4' : 'size-8', className)}
    />
  );
}

export function Loading({ label, dark }: { label?: string; dark?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={cx('flex flex-col items-center justify-center gap-3 py-16', dark ? 'text-gold' : 'text-gold-dark')} aria-live="polite">
      <Spinner />
      <span className="text-sm opacity-80">{label ?? t('common.loading')}</span>
    </div>
  );
}

export function SkeletonCards({ n = 3 }: { n?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="card space-y-3 p-5">
          <div className="skeleton h-5 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry, dark }: { message?: string | null; onRetry?: () => void; dark?: boolean }) {
  const { t } = useI18n();
  return (
    <div role="alert" className={cx('rounded-2xl border p-6 text-center', dark ? 'border-crimson/60 bg-crimson/10 text-ivory' : 'border-crimson/40 bg-crimson/5 text-ink')}>
      <p className="font-semibold">{t('common.error')}</p>
      {message && <p className="mt-1 text-sm opacity-80">{message}</p>}
      {onRetry && (
        <Button variant={dark ? 'gold' : 'outline'} className="mt-4" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, body, action, icon = '🍽️', dark }: { title: string; body?: string; action?: ReactNode; icon?: string; dark?: boolean }) {
  return (
    <div className={cx('rounded-2xl border border-dashed p-10 text-center', dark ? 'border-gold/40 text-ivory' : 'border-ink/20 bg-white/60 text-ink')}>
      <div className="text-4xl" aria-hidden>
        {icon}
      </div>
      <p className="mt-3 font-serif text-lg font-semibold">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm opacity-75">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', children, className }: { tone?: 'info' | 'success' | 'warning' | 'error'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'border-navy/20 bg-navy/5 text-ink',
    success: 'border-emerald-700/30 bg-emerald-50 text-emerald-900',
    warning: 'border-gold-dark/40 bg-gold/10 text-ink',
    error: 'border-crimson/40 bg-crimson/5 text-crimson-700',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-xl border px-4 py-3 text-sm', tones[tone], className)}>
      {children}
    </div>
  );
}

export function Field({ label, hint, error, children, optional }: { label: string; hint?: string; error?: string | null; children: (id: string) => ReactNode; optional?: boolean }) {
  const id = useId();
  const { t } = useI18n();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {optional && <span className="ml-1 font-normal text-ink/50">({t('common.optional')})</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-crimson">{error}</p>}
    </div>
  );
}

export function Badge({ tone = 'navy', children, className }: { tone?: 'navy' | 'gold' | 'red' | 'green' | 'gray' | 'outline'; children: ReactNode; className?: string }) {
  const tones = {
    navy: 'bg-navy text-ivory',
    gold: 'bg-gradient-to-r from-gold-light to-gold text-navy',
    red: 'bg-crimson text-white',
    green: 'bg-emerald-700 text-white',
    gray: 'bg-ink/10 text-ink',
    outline: 'border border-gold-dark/50 text-gold-dark',
  };
  return <span className={cx('badge', tones[tone], className)}>{children}</span>;
}

export function Card({ children, className, as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <As className={cx('card p-5 sm:p-6', className)}>{children}</As>;
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="animate-rise">
        {eyebrow && <p className="heading-eyebrow mb-2">{eyebrow}</p>}
        <h1 className="gold-text text-3xl font-bold sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-ivory/75">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function StatCard({ label, value, icon, dark }: { label: string; value: ReactNode; icon?: string; dark?: boolean }) {
  return (
    <div className={cx('relative overflow-hidden rounded-2xl border p-5', dark ? 'border-gold/40 bg-navy-800/70' : 'card')}>
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-gold to-transparent" />
      {icon && (
        <div className="mb-2 text-2xl" aria-hidden>
          {icon}
        </div>
      )}
      <div className={cx('font-serif text-3xl font-bold', dark ? 'gold-text' : 'text-navy')}>{value}</div>
      <div className={cx('mt-1 text-sm', dark ? 'text-ivory/75' : 'text-ink/70')}>{label}</div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, dark }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[]; dark?: boolean }) {
  return (
    <div role="tablist" className={cx('-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1')}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cx(
              'chip shrink-0',
              active ? 'border-gold bg-gold text-navy' : dark ? 'border-gold/40 text-ivory hover:border-gold' : 'border-ink/20 bg-white text-ink hover:border-gold-dark',
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className={cx('ml-2 rounded-full px-1.5 text-xs', active ? 'bg-navy text-gold' : 'bg-gold/20')}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-navy-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cx('card max-h-[92dvh] w-full animate-rise overflow-y-auto rounded-b-none p-6 outline-none sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-serif text-2xl font-bold text-navy">{title}</h2>
          <button onClick={onClose} className="btn-ghost btn -mt-1 -mr-2 min-h-9 px-3" aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function LoadMore({ hasMore, loading, onClick, dark }: { hasMore: boolean; loading: boolean; onClick: () => void; dark?: boolean }) {
  const { t } = useI18n();
  if (!hasMore) return null;
  return (
    <div className="mt-6 flex justify-center">
      <Button variant={dark ? 'gold' : 'outline'} loading={loading} onClick={onClick}>
        {t('common.next')} →
      </Button>
    </div>
  );
}

export function Stars({ value, onChange, size = 'text-2xl' }: { value: number; onChange?: (v: number) => void; size?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-1" role={onChange ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          role={onChange ? 'radio' : undefined}
          aria-checked={onChange ? value === n : undefined}
          aria-label={t('rating.stars', { n })}
          onClick={() => onChange?.(n)}
          className={cx(size, 'leading-none transition', n <= value ? 'text-gold' : 'text-ink/20', onChange && 'hover:scale-110')}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function LinkButton({ to, variant = 'primary', children, className }: { to: string; variant?: Variant; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={cx('btn', `btn-${variant}`, className)}>
      {children}
    </Link>
  );
}

export function Checkbox({ checked, onChange, children, id }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; id?: string }) {
  const autoId = useId();
  const cid = id ?? autoId;
  return (
    <label htmlFor={cid} className="flex cursor-pointer items-start gap-3 rounded-xl p-2 text-sm text-ink hover:bg-ink/5">
      <input id={cid} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-crimson" />
      <span>{children}</span>
    </label>
  );
}
