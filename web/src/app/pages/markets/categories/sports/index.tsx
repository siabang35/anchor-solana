import { Routes, Route, useParams, useOutletContext } from "react-router-dom";
import { Suspense, lazy } from "react";
import { LoadingSpinner } from "../../../../components/LoadingSpinner";
import { SportsMarketPage } from "../../SportsMarketPage";

// Lazy Load Sports Components for "Best Practices" Chunking
const AFLPage = lazy(() => import("./afl/index"));
const BaseballPage = lazy(() => import("./baseball/index"));
const BasketballPage = lazy(() => import("./basketball/index"));
const FootballPage = lazy(() => import("./football/index"));
const Formula1Page = lazy(() => import("./formula-1/index"));
const HandballPage = lazy(() => import("./handball/index"));
const HockeyPage = lazy(() => import("./hockey/index"));
const MMAPage = lazy(() => import("./mma/index"));
const NBAPage = lazy(() => import("./nba/index"));
const NFLPage = lazy(() => import("./nfl/index"));
const RugbyPage = lazy(() => import("./rugby/index"));
const VolleyballPage = lazy(() => import("./volleyball/index"));

// Wrapper to pass properly typed params to the page (Fallback)
function SportsPageWrapper() {
    const { sportId } = useParams();
    const { onOpenAuth } = useOutletContext<{ onOpenAuth: (mode?: 'login' | 'signup') => void }>() || {};
    return <SportsMarketPage initialSport={sportId} onOpenAuth={onOpenAuth || (() => { })} />;
}

function SportsLoader() {
    return (
        <div className="flex justify-center items-center h-48">
            <LoadingSpinner />
        </div>
    );
}

export default function SportsIndex() {
    return (
        <Suspense fallback={<SportsLoader />}>
            <Routes>
                {/* Root /markets/sports -> Live/All */}
                <Route index element={<SportsPageWrapper />} />

                {/* Explicit Lazy Loaded Routes for Structure */}
                <Route path="afl" element={<AFLPage />} />
                <Route path="baseball" element={<BaseballPage />} />
                <Route path="basketball" element={<BasketballPage />} />
                <Route path="football" element={<FootballPage />} />
                <Route path="formula-1" element={<Formula1Page />} />
                <Route path="handball" element={<HandballPage />} />
                <Route path="hockey" element={<HockeyPage />} />
                <Route path="mma" element={<MMAPage />} />
                <Route path="nba" element={<NBAPage />} />
                <Route path="nfl" element={<NFLPage />} />
                <Route path="rugby" element={<RugbyPage />} />
                <Route path="volleyball" element={<VolleyballPage />} />

                {/* Dynamic Fallback for any other future sports */}
                <Route path=":sportId" element={<SportsPageWrapper />} />
            </Routes>
        </Suspense>
    );
}
