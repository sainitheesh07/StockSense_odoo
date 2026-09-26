import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockSense — Inventory Management",
  description:
    "Centralized, real-time inventory management: receipts, deliveries, transfers, adjustments and a complete stock ledger.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
