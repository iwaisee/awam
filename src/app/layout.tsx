import type { Metadata } from "next";
import { Hanken_Grotesk, Plus_Jakarta_Sans } from "next/font/google";
import { CoverageProvider } from "@/context/CoverageContext";
import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Sada-e-Awam | صدائے عوام",
  description:
    "Sada-e-Awam — civic reporting, live as a Phase 1 pilot in Sialkot. Lahore & Islamabad open in Phase 2.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${hankenGrotesk.variable} ${plusJakartaSans.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          attributes onto <body> before hydration, causing false mismatches. */}
      <body className="min-h-full" suppressHydrationWarning>
        <CoverageProvider>{children}</CoverageProvider>
      </body>
    </html>
  );
}
