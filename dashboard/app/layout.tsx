import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { AppSidebar } from "@/components/app-sidebar";
import { PageTransition } from "@/components/page-transition";
import { ToastProvider } from "@/components/toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voice Agent",
  description: "ElevenLabs voice agent dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ConvexClientProvider>
          <ToastProvider>
            <AppSidebar />
            <main className="min-h-dvh px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:pb-8 lg:pl-64">
              <div className="mx-auto max-w-6xl lg:pl-10 lg:pr-6">
                <PageTransition>{children}</PageTransition>
              </div>
            </main>
          </ToastProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
