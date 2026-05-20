import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "prdise",
  description: "SaaS de reservas para Puerto Rico — estadías, tours y traslados.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
