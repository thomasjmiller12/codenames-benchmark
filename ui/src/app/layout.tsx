import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getOverallStats } from "@/lib/data";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Codenames LLM Benchmark",
  description: "AI models compete in the board game Codenames",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const stats = await getOverallStats();

  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        <TooltipProvider>
          <Sidebar totalGames={stats.totalGames} totalModels={stats.totalModels} />
          <main className="ml-60 min-h-screen">
            <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
          </main>
        </TooltipProvider>
      </body>
    </html>
  );
}
