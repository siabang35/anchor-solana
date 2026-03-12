import { CategoryPage } from "../CategoryPage";
import { useAdvancedMarketRanking } from "../../../hooks/useAdvancedMarketRanking";

export function ForYouLayout() {
    const { forYouMarkets, isLoading, loadMore, hasMore } = useAdvancedMarketRanking({ target: 'for_you' });

    return (
        <CategoryPage
            category="for_you"
            title="Recommended For You"
            overrideMarkets={forYouMarkets}
            isLoadingOverride={isLoading}
            loadMoreOverride={loadMore}
            hasMoreOverride={hasMore}
        />
    );
}
