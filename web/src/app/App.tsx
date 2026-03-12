import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoadingSpinner } from "./components/LoadingSpinner";

// Layouts
import { RootLayout } from "./layouts/RootLayout";
import { MarketsLayout } from "./layouts/MarketsLayout";

// Lazy Loaded Pages
const MarketsIndex = lazy(() => import("./pages/markets/MarketsIndex").then(module => ({ default: module.MarketsIndex })));
const PortfolioPage = lazy(() => import("./pages/portfolio").then(module => ({ default: module.PortfolioPage })));
const SearchPage = lazy(() => import("./pages/search").then(module => ({ default: module.SearchPage })));
const NotificationsPage = lazy(() => import("./pages/notifications").then(module => ({ default: module.NotificationsPage })));
const SettingsPage = lazy(() => import("./pages/settings").then(module => ({ default: module.SettingsPage })));
const MarketDetailPage = lazy(() => import("./pages/markets/MarketDetailPage").then(module => ({ default: module.MarketDetailPage })));

// Competition Pages (AI Quant)
const CompetitionDashboard = lazy(() => import("./pages/competition/CompetitionDashboard"));
const CategoryCompetitionPage = lazy(() => import("./pages/competition/CategoryCompetitionPage"));

// Auth Pages (Lazy Loaded)
const AuthCallbackPage = lazy(() => import("./pages/auth/AuthCallbackPage").then(module => ({ default: module.AuthCallbackPage })));
const VerifyEmailPage = lazy(() => import("./pages/auth/VerifyEmailPage").then(module => ({ default: module.VerifyEmailPage })));
const AuthErrorPage = lazy(() => import("./pages/auth/AuthErrorPage").then(module => ({ default: module.AuthErrorPage })));

// Admin Pages (Lazy Loaded)
const AdminLayout = lazy(() => import("./admin/AdminLayout").then(module => ({ default: module.AdminLayout })));
const AdminOverview = lazy(() => import("./admin/AdminOverview").then(module => ({ default: module.AdminOverview })));
const AdminUsers = lazy(() => import("./admin/AdminUsers").then(module => ({ default: module.AdminUsers })));
const AdminFinance = lazy(() => import("./admin/AdminFinance").then(module => ({ default: module.AdminFinance })));
const AdminSecurity = lazy(() => import("./admin/AdminSecurity").then(module => ({ default: module.AdminSecurity })));
import { AdminRoute } from "./components/auth/AdminGuard";
import { AuthGuard } from "./components/auth/AuthGuard";

import { MarketDataProvider } from "../providers/MarketDataProvider";

function App() {
  return (
    <BrowserRouter>
      <MarketDataProvider>
        <Routes>
          <Route element={<RootLayout />}>
            {/* Root path shows Top Markets directly (no URL change) */}
            {/* Root path redirects to Markets (Top Markets) */}
            {/* Root path shows Top Markets directly */}
            <Route path="/" element={<MarketsLayout />}>
              <Route index element={<MarketsIndex />} />
              <Route path="*" element={<MarketsIndex />} />
            </Route>

            {/* Redirect /markets to / for legacy compatibility */}
            <Route path="markets" element={<Navigate to="/" replace />} />

            {/* Other Top Level Routes */}

            <Route path="portfolio" element={
              <AuthGuard>
                <Suspense fallback={<PageLoader />}>
                  <PortfolioPage />
                </Suspense>
              </AuthGuard>
            } />

            <Route path="search" element={
              <Suspense fallback={<PageLoader />}>
                <SearchPage />
              </Suspense>
            } />

            <Route path="market/:id" element={
              <Suspense fallback={<PageLoader />}>
                <MarketDetailPage />
              </Suspense>
            } />

            <Route path="notifications" element={
              <AuthGuard>
                <Suspense fallback={<PageLoader />}>
                  <NotificationsPage />
                </Suspense>
              </AuthGuard>
            } />

            <Route path="settings" element={
              <AuthGuard>
                <Suspense fallback={<PageLoader />}>
                  <SettingsPage />
                </Suspense>
              </AuthGuard>
            } />

            {/* AI Quant Competition Routes */}
            <Route path="competition" element={
              <Suspense fallback={<PageLoader />}>
                <CompetitionDashboard />
              </Suspense>
            } />
            <Route path="competition/:sector" element={
              <Suspense fallback={<PageLoader />}>
                <CategoryCompetitionPage />
              </Suspense>
            } />

            {/* Placeholders for future routes */}
            <Route path="ranks" element={<div className="p-8 text-center text-muted-foreground">Global Ranks Coming Soon</div>} />
            <Route path="activity" element={<div className="p-8 text-center text-muted-foreground">Activity Feed Coming Soon</div>} />
            <Route path="rewards" element={<div className="p-8 text-center text-muted-foreground">Rewards & Airdrops Coming Soon</div>} />

            {/* Auth Routes - OAuth Callback */}
            <Route path="auth/callback" element={
              <Suspense fallback={<PageLoader />}>
                <AuthCallbackPage />
              </Suspense>
            } />
            <Route path="auth/verify" element={
              <Suspense fallback={<PageLoader />}>
                <VerifyEmailPage />
              </Suspense>
            } />
            <Route path="auth/error" element={
              <Suspense fallback={<PageLoader />}>
                <AuthErrorPage />
              </Suspense>
            } />

            {/* Admin Routes */}
            <Route path="admin" element={
              <AdminRoute>
                <Suspense fallback={<PageLoader />}>
                  <AdminLayout onLogout={() => { window.location.href = '/'; }}>
                    {/* The AdminLayout likely needs refactoring to support Outlet too, but for now we might need to render sub-components manually or adjust AdminLayout to use Routes if we want deep linking there too. 
                        For this step, let's keep it simple or assume AdminLayout handles its own sub-rendering via props or we refactor it.
                        Actually, looking at previous App.tsx, AdminLayout took children.
                    */}
                    <Routes>
                      <Route index element={<Navigate to="overview" replace />} />
                      <Route path="overview" element={<AdminOverview />} />
                      <Route path="users" element={<AdminUsers />} />
                      <Route path="finance" element={<AdminFinance />} />
                      <Route path="security" element={<AdminSecurity />} />
                    </Routes>
                  </AdminLayout>
                </Suspense>
              </AdminRoute>
            } >
              {/* Nested admin routes if AdminLayout renders Outlet */}
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<AdminOverview />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="finance" element={<AdminFinance />} />
              <Route path="security" element={<AdminSecurity />} />
            </Route>

          </Route>
        </Routes>
      </MarketDataProvider>
    </BrowserRouter>
  );
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <LoadingSpinner />
    </div>
  );
}

export default App;