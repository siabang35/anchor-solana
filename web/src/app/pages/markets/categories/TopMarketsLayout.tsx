import { CategoryPage } from "../CategoryPage";
import { useAdvancedMarketRanking } from "../../../hooks/useAdvancedMarketRanking";

export function TopMarketsLayout() {
    const { topMarkets, isLoading, loadMore, hasMore } = useAdvancedMarketRanking({ target: 'top_markets' });

    // While loading, we can just pass loading state to CategoryPage
    // If error, CategoryPage handles it (though we return null for error object here as hook returns void/undefined for now)
    // Actually our hook returns { error, ... } compatible

    return (
        <CategoryPage
            category="top_markets"
            title="Top Markets (Algorithm Ranked)"
            overrideMarkets={topMarkets}
            isLoadingOverride={isLoading}
            loadMoreOverride={loadMore}
            hasMoreOverride={hasMore}
        />
    );
}
