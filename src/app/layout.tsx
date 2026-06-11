import type { Metadata } from "next";
import "./globals.css";
import AuthBridge from "@/components/AuthBridge";

export const metadata: Metadata = {
  title: {
    default: "Living in PRDISE — Your Transportation Solution",
    template: "%s · Living in PRDISE",
  },
  description:
    "Living in PRDISE — Transporte, tours y estadías en Puerto Rico. Transport · Discover · Experience.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthBridge />
        {children}
      </body>
    </html>
  );
}
