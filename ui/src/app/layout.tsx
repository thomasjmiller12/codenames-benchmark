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
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        <TooltipProvider>
          <div className="flex min-h-screen">
            <Sidebar totalGames={stats.totalGames} totalModels={stats.totalModels} />
            <main className="flex-1 min-w-0 pt-14 md:pt-0">
              <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
            </main>
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
