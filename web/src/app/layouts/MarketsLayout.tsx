import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { CategoryNav } from "../components/CategoryNav";
import { MO_MARKET_CATEGORIES } from "../pages/markets/marketsConfig";

export function MarketsLayout() {
    const navigate = useNavigate();
    const location = useLocation();

    // Determine active category based on URL path
    // / -> top_markets (path "")
    // /sports -> sports (path "sports/*")
    const currentPath = location.pathname === "/" ? "" : location.pathname.substring(1);

    // Find active category - handle wildcard paths (e.g., "sports/*")
    const activeCategory = MO_MARKET_CATEGORIES.find(c => {
        if (c.path === "") {
            // Root path - exact match only
            return currentPath === "";
        }
        if (c.path.endsWith("/*")) {
            // Wildcard path - check if currentPath starts with the base path
            const basePath = c.path.replace("/*", "");
            return currentPath === basePath || currentPath.startsWith(basePath + "/");
        }
        // Exact match
        return c.path === currentPath;
    })?.id || "top_pics";

    const handleSelectCategory = (categoryId: string) => {
        const category = MO_MARKET_CATEGORIES.find(c => c.id === categoryId);
        if (category) {
            // Remove wildcard for navigation (e.g., "sports/*" -> "sports")
            const navPath = category.path.replace("/*", "");
            navigate(navPath ? `/${navPath}` : "/");
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-background">
            <CategoryNav
                activeCategory={activeCategory}
                onSelectCategory={handleSelectCategory}
            />
            <div className="flex-1 w-full">
                <Outlet />
            </div>
        </div>
    );
}
