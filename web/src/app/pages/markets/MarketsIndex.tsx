import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { MO_MARKET_CATEGORIES } from "./marketsConfig";

// Dedicated Page Views (Anti-Throttling & Scalable)
const GenericCategoryView = lazy(() => import("./categories/GenericCategoryView").then(m => ({ default: m.GenericCategoryView })));
const SportsIndex = lazy(() => import("./categories/sports/index"));

// Specialized Category Pages
const LatestPage = lazy(() => import("./categories/latest/Latest"));
const PoliticsPage = lazy(() => import("./categories/politics/Politics"));
const SignalsPage = lazy(() => import("./categories/signals/Signals"));
const FinancePage = lazy(() => import("./categories/finance/Finance"));
const TechPage = lazy(() => import("./categories/tech/Tech"));
const CryptoPage = lazy(() => import("./categories/crypto/Crypto"));
const EconomyPage = lazy(() => import("./categories/economy/Economy"));
const SciencePage = lazy(() => import("./categories/science/Science"));

// Algorithmic Layouts
const TopMarketsLayout = lazy(() => import("./categories/TopMarketsLayout").then(m => ({ default: m.TopMarketsLayout })));
const ForYouLayout = lazy(() => import("./categories/ForYouLayout").then(m => ({ default: m.ForYouLayout })));

function MarketLoader() {
    return (
        <div className="flex justify-center items-center py-20">
            <LoadingSpinner size="lg" />
        </div>
    );
}

export function MarketsIndex() {
    return (
        <Suspense fallback={<MarketLoader />}>
            <Routes>
                {MO_MARKET_CATEGORIES.map((category) => {
                    // Specific overrides for layouts
                    if (category.id === "top_markets") return <Route key={category.id} index element={<TopMarketsLayout />} />;
                    if (category.id === "for_you") return <Route key={category.id} path={category.path} element={<ForYouLayout />} />;

                    // Dedicated Component Mapping
                    let Element: React.ComponentType<any> = GenericCategoryView;
                    if (category.id === "latest") Element = LatestPage;
                    if (category.id === "politics") Element = PoliticsPage;
                    if (category.id === "signals") Element = SignalsPage;
                    if (category.id === "finance") Element = FinancePage;
                    if (category.id === "tech") Element = TechPage;
                    if (category.id === "crypto") Element = CryptoPage;
                    if (category.id === "economy") Element = EconomyPage;
                    if (category.id === "science") Element = SciencePage;
                    if (category.id === "sports") Element = SportsIndex;

                    // Root path handling (should be covered by top_pics above, but safe fallback)
                    if (category.path === "") {
                        return <Route key={category.id} index element={<Element category={category.id} />} />;
                    }

                    // Sub-routes handling
                    return (
                        <Route
                            key={category.id}
                            path={category.path}
                            element={<Element category={category.id} />}
                        />
                    );
                })}


                {/* Fallback */}
                <Route path="*" element={<Navigate to="" replace />} />
            </Routes>
        </Suspense>
    );
}
