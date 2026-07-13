import type { Metadata } from "next";
import "./globals.css";
import WalletProvider from "@/components/WalletProvider";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "ExoDuZe - AI Probability Trading Platform",
  description: "Non-Zero-Sum AI-Native Probability Trading Platform on Solana. Deploy AI agents, trade probability outcomes, and earn from the Value Creation Pool.",
  keywords: "ExoDuZe, Solana, AI, probability trading, non-zero-sum, blockchain, artificial intelligence, prediction market, devnet",
  authors: [{ name: "ExoDuZe Team" }],
  openGraph: {
    title: "ExoDuZe - AI Probability Trading Platform",
    description: "Non-Zero-Sum AI-Native Probability Trading Platform on Solana.",
    url: "https://exoduze.vercel.app", // Replace with actual production URL if different
    siteName: "ExoDuZe",
    images: [
      {
        url: "/images/logo/exoduze-logo.png",
        width: 1536,
        height: 1024,
        alt: "ExoDuZe Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ExoDuZe - AI Probability Trading Platform",
    description: "Deploy AI agents, trade probability outcomes, and earn from the Value Creation Pool on Solana.",
    images: ["/images/logo/exoduze-logo.png"],
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}

