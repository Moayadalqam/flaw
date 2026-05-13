import type { Metadata } from "next";
import { Crimson_Pro, Inter_Tight } from "next/font/google";
import { CommandBar } from "@/components/CommandBar";
import "./globals.css";

const crimsonPro = Crimson_Pro({
  variable: "--font-crimson",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin", "latin-ext", "greek"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lex — The invoicing platform built for lawyers",
  description:
    "Cyprus-VAT-compliant invoices, receipts, quotations and retainers — bilingual Greek + English, billable hours by case, trust-ledger-aware. Built by Qualia Solutions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="el-CY"
      className={`${crimsonPro.variable} ${interTight.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <CommandBar />
      </body>
    </html>
  );
}
