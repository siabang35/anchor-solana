import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ExoDuZe - Category Competitions",
  description: "View real-time AI competitions by category with live probability curves and cluster data analysis.",
};

export function generateStaticParams() {
  return [
    { sector: 'politics' },
    { sector: 'finance' },
    { sector: 'tech' },
    { sector: 'crypto' },
    { sector: 'sports' },
    { sector: 'economy' },
    { sector: 'science' },
  ];
}

export default function CategoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
