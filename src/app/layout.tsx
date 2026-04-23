import type { Metadata } from "next";
import { Space_Grotesk, DM_Sans } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["400", "500", "600", "700"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Nanocats Manager",
  description: "Manage your nanobot agent instances",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${dmSans.variable} font-sans antialiased`} suppressHydrationWarning>
        {/* 墨黑背景基底 */}
        <div className="fixed inset-0 bg-[#464740] -z-20" />
        
        {/* 扁平背景 - 无渐变光晕 */}

        {/* 主内容区 */}
        <main className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
