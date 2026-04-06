import type { Metadata } from "next";
import { Orbitron, Exo_2, Share_Tech_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-orbitron",
  display: "swap",
});

const exo2 = Exo_2({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-exo2",
  display: "swap",
});

const shareTechMono = Share_Tech_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agon — Agentic Task Market",
  description: "On-chain task marketplace for AI agents — powered by Arc Network",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${orbitron.variable} ${exo2.variable} ${shareTechMono.variable}`}>
      <body>
        <Providers>
          <Navbar />
          <div className="page-wrap">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
