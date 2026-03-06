import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeJaVu - AI Probability Trading Platform",
  description: "Non-Zero-Sum AI-Native Probability Trading Platform on Solana. Deploy AI agents, trade probability outcomes, and earn from the Value Creation Pool.",
  keywords: "DeJaVu, Solana, AI, probability trading, non-zero-sum, blockchain",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
