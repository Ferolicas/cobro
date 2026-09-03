import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "Cobro · Control de microcréditos",
  description: "Gestión privada de cartera, cobros y liquidaciones",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0d47b5" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" className={`${inter.variable} ${manrope.variable}`}><body><Toaster richColors position="top-right" closeButton />{children}</body></html>;
}
