// src/app/layout.tsx (example modification)
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // Tailwind base styles

const inter = Inter({ subsets: ["latin"] }); // Or choose another font

export const metadata: Metadata = {
  title: "eCFR Agency Viewer",
  description: "Query eCFR data by agency",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      {/* Apply dark theme background similar to doge.gov */}
      <body className={`${inter.className} min-h-screen bg-gray-950 text-gray-200`}>
        {/* Optional: Add Header/Footer components here later */}
        <main id="main-content" className="container mx-auto max-w-7xl py-8 px-4">
           {children}
        </main>
      </body>
    </html>
  );
}
