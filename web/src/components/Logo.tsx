import { Link } from 'react-router-dom';

export function Emblem({ className = 'size-10' }: { className?: string }) {
  return <img src="/logo.svg" alt="" width={40} height={40} className={className} />;
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="group flex items-center gap-2.5" aria-label="SurplusServe home">
      <Emblem className="size-9 transition-transform duration-300 group-hover:scale-105 sm:size-10" />
      <span className="font-serif text-xl leading-none font-bold tracking-wide">
        <span className="leaf-text">Surplus</span>
        <span className="text-ivory">Serve</span>
      </span>
    </Link>
  );
}
