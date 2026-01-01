import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Silver Market Analysis - COMEX vs SGE Spread",
  description: "Track physical silver availability and price spreads between COMEX and Shanghai Gold Exchange",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
