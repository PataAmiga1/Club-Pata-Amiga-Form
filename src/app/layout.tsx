import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import localFont from "next/font/local";
import { Analytics } from "@/components/analytics/Analytics";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const fraiche = localFont({
  src: "../fonts/fraiche.otf",
  variable: "--font-fraiche",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Club Pata Amiga — Protección para tu manada",
  description:
    "Membresía de salud para tu peludo en México: reintegros de gastos veterinarios, orientación veterinaria 24/7, red de centros aliados y más. Disponible en todo México, 100% digital.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-MX"
      className={`${outfit.variable} ${fraiche.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Medición: no carga NADA mientras no existan las llaves de GA4/Meta */}
        <Analytics />
      </body>
    </html>
  );
}
