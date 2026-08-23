import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import "./globals.css";

const pixel = Silkscreen({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  title: "ReachInbox — Email Scheduler",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={pixel.variable}>
      <body>{children}</body>
    </html>
  );
}
