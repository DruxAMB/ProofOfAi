import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Lora } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-inter" });
const jbmono = JetBrains_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-jbmono" });
const lora = Lora({ subsets: ["latin"], weight: ["400"], style: "italic", variable: "--font-lora" });

export const metadata: Metadata = {
  title: "ProofOfAI · Content Authenticity",
  description: "Content authenticity registry — notarize hashes on BOT Chain — live on BOT Chain mainnet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jbmono.variable} ${lora.variable} font-sans`}>{children}</body>
    </html>
  );
}
