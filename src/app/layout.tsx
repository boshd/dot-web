import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BenjiAuthProvider } from "@/components/benji-auth-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dot — chat naturally",
  description: "Talk with Dot, your personal AI companion, from any channel.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BenjiAuthProvider>{children}</BenjiAuthProvider>
      </body>
    </html>
  );
}
