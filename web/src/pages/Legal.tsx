import type { ReactNode } from 'react';
import { Container } from '../components/Layout';
import { Alert, PageHeader } from '../components/ui';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/hooks';

const UPDATED = '2026-10-08';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-xl font-bold text-verd">{title}</h2>
      <div className="mt-2 space-y-3 leading-relaxed text-ink/85">{children}</div>
    </section>
  );
}

function Terms({ cap }: { cap: number }) {
  return (
    <>
      <Section title="1. What SurplusServe is">
        <p>
          SurplusServe is a free platform that connects food businesses (“Restaurants”) that have surplus cooked food with
          verified non-profit organisations (“NGOs”) that distribute food to people in need. SurplusServe does not cook, store,
          handle, transport, sell or distribute food and is not a party to any handover.
        </p>
      </Section>
      <Section title="2. Accounts">
        <p>You sign in with Google and choose to register as a Restaurant or an NGO. You must give accurate information, keep it up to date and keep your account secure. One organisation may not operate multiple accounts to evade suspension.</p>
        <p>Restaurants must hold a valid FSSAI licence. NGOs must be legally registered and upload proof of registration. We may approve, reject, suspend or remove any account at our discretion, including after three no-shows.</p>
      </Section>
      <Section title="3. Food is free; packaging cost only">
        <p>
          Food listed on SurplusServe is shared free of charge. A Restaurant may ask the NGO to pay a packaging cost per serving,
          shown on the listing and capped at ₹{cap} per serving. It is paid directly to the Restaurant at pickup (UPI or cash).
          SurplusServe processes no payments and charges NGOs nothing.
        </p>
      </Section>
      <Section title="4. Restaurant obligations">
        <ul className="list-disc space-y-1 pl-5">
          <li>Only list food that is safe, unserved, hygienically prepared and stored at safe temperatures.</li>
          <li>Complete the food-safety checklist truthfully for every listing, and declare allergens and food type accurately.</li>
          <li>Set an honest “safe until” time and hand over food in clean, food-grade packaging.</li>
          <li>Verify each pickup only with the NGO’s OTP. Never charge more than the listed packaging cost.</li>
        </ul>
      </Section>
      <Section title="5. NGO obligations">
        <ul className="list-disc space-y-1 pl-5">
          <li>Only claim what you can collect within the pickup window and distribute before the safe-until time.</li>
          <li>Cancel claims you cannot fulfil. Uncollected claims are recorded as no-shows; three no-shows suspend the account.</li>
          <li>Inspect food at pickup, keep it at safe temperatures and refuse anything that appears unsafe.</li>
          <li>Never sell food obtained through SurplusServe.</li>
        </ul>
      </Section>
      <Section title="6. Acceptable use">
        <p>Do not misuse the platform: no false listings, spam, scraping, attempts to access others’ data, or interference with the service. Contact details shown to you are for coordinating pickups only.</p>
      </Section>
      <Section title="7. Liability">
        <p>
          SurplusServe is provided “as is”. To the extent permitted by law, SurplusServe and its operators are not liable for the
          quality, safety or fitness of any food, or for any loss arising from a handover between Restaurants and NGOs. See the
          Food Safety Disclaimer.
        </p>
      </Section>
      <Section title="8. Changes and contact">
        <p>We may update these terms; continued use means acceptance. Questions can be raised via the Sponsor us page or by email to the platform administrators.</p>
      </Section>
    </>
  );
}

function Privacy() {
  return (
    <>
      <Section title="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>Google account basics: name, email address and profile photo.</li>
          <li>Organisation details you provide: name, address and map location, city, phone, FSSAI or registration number, UPI ID (optional) and uploaded registration certificates.</li>
          <li>Activity: listings, claims, pickups, ratings and the immutable pickup audit log.</li>
          <li>Location you choose to share in the browser for searching. It is used for that search only and not stored.</li>
        </ul>
      </Section>
      <Section title="How we use it">
        <p>To run the service: verify organisations, show listings and distances, share contact details between a Restaurant and the NGO that claimed its food, send service emails (OTP, approvals, alerts), prevent abuse, and produce aggregate impact statistics and sponsor reports.</p>
      </Section>
      <Section title="Who can see what">
        <ul className="list-disc space-y-1 pl-5">
          <li>NGOs see a Restaurant’s name and approximate distance when searching, and full address, phone and UPI ID after claiming.</li>
          <li>Restaurants see the claiming NGO’s name, phone and reliability score.</li>
          <li>Registration certificates are visible only to the uploading NGO and administrators.</li>
          <li>Public pages show only aggregate numbers and names of Restaurants that have not chosen to hide their name.</li>
          <li>Sponsor reports contain organisation names and meal counts, never personal contact data.</li>
        </ul>
      </Section>
      <Section title="Processors">
        <p>Cloudflare (hosting, database, file storage), Google (sign-in), Resend (email delivery) and OpenStreetMap/Nominatim (maps and address lookup). We do not sell personal data and use no advertising trackers.</p>
      </Section>
      <Section title="Cookies">
        <p>We use one essential, httpOnly session cookie to keep you signed in, and a short-lived cookie during Google sign-in. Your language preference is stored in your browser.</p>
      </Section>
      <Section title="Retention and your rights">
        <p>Account data is kept while your account is active. The pickup audit log is retained permanently as proof of impact. You may request access, correction or deletion of your personal data (subject to audit-log retention) by contacting the administrators, in line with India’s Digital Personal Data Protection Act, 2023.</p>
      </Section>
    </>
  );
}

function Disclaimer() {
  return (
    <>
      <Alert tone="warning" className="mt-6 text-base">
        <strong>SurplusServe only connects parties.</strong> It does not prepare, inspect, store, handle, transport or distribute food,
        and makes no representation about the safety, quality, allergen content or fitness for consumption of any food listed.
      </Alert>
      <Section title="Responsibility for food safety">
        <p>The Restaurant listing the food is responsible for its preparation, storage, labelling and packaging in line with the Food Safety and Standards Act, 2006 and FSSAI regulations. The NGO collecting the food is responsible for safe transport, storage, inspection and timely distribution.</p>
      </Section>
      <Section title="Checklists and acknowledgements">
        <p>The mandatory food-safety checklist and the NGO safety acknowledgement are declarations made by those parties. SurplusServe does not verify them and they do not transfer responsibility to SurplusServe.</p>
      </Section>
      <Section title="Allergens and dietary information">
        <p>Food type (veg, non-veg, Jain) and allergen tags are provided by Restaurants. NGOs must check them before serving and inform recipients. When in doubt, do not serve.</p>
      </Section>
      <Section title="Safe-until times">
        <p>Listings expire automatically at the safe-until time set by the Restaurant. Food must not be served after that time, regardless of appearance.</p>
      </Section>
      <Section title="Report a problem">
        <p>If you believe food shared through SurplusServe was unsafe, stop distributing it, keep a sample if possible and inform the administrators and, where appropriate, your local food safety officer.</p>
      </Section>
    </>
  );
}

export default function Legal({ page }: { page: 'terms' | 'privacy' | 'disclaimer' }) {
  const { t, locale } = useI18n();
  const { config } = useAuth();
  const title = t(page === 'terms' ? 'legal.terms' : page === 'privacy' ? 'legal.privacy' : 'legal.disclaimer');
  useDocumentTitle(title);
  return (
    <Container className="max-w-3xl">
      <PageHeader title={title} subtitle={t('legal.updated', { date: UPDATED })} />
      <article className="card p-6 sm:p-10">
        {locale !== 'en' && <Alert className="mb-4">{t('legal.englishOnly')}</Alert>}
        {page === 'terms' && <Terms cap={config?.packagingCap ?? 15} />}
        {page === 'privacy' && <Privacy />}
        {page === 'disclaimer' && <Disclaimer />}
      </article>
    </Container>
  );
}
