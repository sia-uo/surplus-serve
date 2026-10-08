import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from './components/Guards';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { homeFor, useAuth } from './lib/auth';
import Landing from './pages/Landing';

const Login = lazy(() => import('./pages/Login'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Legal = lazy(() => import('./pages/Legal'));
const SponsorUs = lazy(() => import('./pages/SponsorUs'));
const CityImpact = lazy(() => import('./pages/CityImpact'));
const CityIndex = lazy(() => import('./pages/CityIndex'));
const NotFound = lazy(() => import('./pages/NotFound'));

const RestaurantHome = lazy(() => import('./pages/restaurant/RestaurantHome'));
const NewListing = lazy(() => import('./pages/restaurant/NewListing'));
const Recurring = lazy(() => import('./pages/restaurant/Recurring'));
const RestaurantImpact = lazy(() => import('./pages/restaurant/Impact'));
const Premium = lazy(() => import('./pages/restaurant/Premium'));
const RestaurantProfilePage = lazy(() => import('./pages/restaurant/ProfilePage'));

const NgoSearch = lazy(() => import('./pages/ngo/Search'));
const NgoClaims = lazy(() => import('./pages/ngo/Claims'));
const NgoProfilePage = lazy(() => import('./pages/ngo/ProfilePage'));

const AdminShell = lazy(() => import('./pages/admin/AdminShell'));
const AdminOverview = lazy(() => import('./pages/admin/Overview'));
const AdminVerifications = lazy(() => import('./pages/admin/Verifications'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminListings = lazy(() => import('./pages/admin/Listings'));
const AdminClaims = lazy(() => import('./pages/admin/Claims'));
const AdminSponsors = lazy(() => import('./pages/admin/Sponsors'));
const AdminReports = lazy(() => import('./pages/admin/Reports'));
const ReportPrint = lazy(() => import('./pages/admin/ReportPrint'));
const AdminAudit = lazy(() => import('./pages/admin/Audit'));
const AdminMessages = lazy(() => import('./pages/admin/Messages'));

function DashboardRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Loading dark />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homeFor(user.role)} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading dark />}>
      <Routes>
        <Route path="/admin/reports/print" element={<RequireRole roles={['admin']}><ReportPrint /></RequireRole>} />
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="login" element={<Login />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="dashboard" element={<DashboardRedirect />} />
          <Route path="terms" element={<Legal page="terms" />} />
          <Route path="privacy" element={<Legal page="privacy" />} />
          <Route path="disclaimer" element={<Legal page="disclaimer" />} />
          <Route path="sponsor-us" element={<SponsorUs />} />
          <Route path="impact" element={<CityIndex />} />
          <Route path="impact/:city" element={<CityImpact />} />

          <Route path="restaurant" element={<RequireRole roles={['restaurant']}><RestaurantHome /></RequireRole>} />
          <Route path="restaurant/new" element={<RequireRole roles={['restaurant']}><NewListing /></RequireRole>} />
          <Route path="restaurant/recurring" element={<RequireRole roles={['restaurant']}><Recurring /></RequireRole>} />
          <Route path="restaurant/impact" element={<RequireRole roles={['restaurant']}><RestaurantImpact /></RequireRole>} />
          <Route path="restaurant/premium" element={<RequireRole roles={['restaurant']}><Premium /></RequireRole>} />
          <Route path="restaurant/profile" element={<RequireRole roles={['restaurant']}><RestaurantProfilePage /></RequireRole>} />

          <Route path="ngo" element={<RequireRole roles={['ngo']}><NgoSearch /></RequireRole>} />
          <Route path="ngo/claims" element={<RequireRole roles={['ngo']}><NgoClaims /></RequireRole>} />
          <Route path="ngo/profile" element={<RequireRole roles={['ngo']}><NgoProfilePage /></RequireRole>} />

          <Route path="admin" element={<RequireRole roles={['admin']}><AdminShell /></RequireRole>}>
            <Route index element={<AdminOverview />} />
            <Route path="verifications" element={<AdminVerifications />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="listings" element={<AdminListings />} />
            <Route path="claims" element={<AdminClaims />} />
            <Route path="sponsors" element={<AdminSponsors />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="messages" element={<AdminMessages />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
