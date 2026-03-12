import { CategoryPage } from "../CategoryPage";

export function GenericCategoryView({ category }: { category: string }) {
    return <CategoryPage category={category} showFilter={true} />;
}
