import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastHost } from "@/components/ToastHost";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Inaá Studio",
    template: "Inaá Studio - %s",
  },
  description: "Ferramenta para criação de projetos de modelagem",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  try {
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored === "dark" || (stored === null && prefersDark);
    document.documentElement.classList.toggle("dark", isDark);
  } catch {
    // ignore
  }
})();`,
          }}
        />
        {/* next/font doesn't support Material Symbols; keep it as a link. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${inter.variable} antialiased`}
        suppressHydrationWarning
      >
        <ToastHost />
        {children}
      </body>
    </html>
  );
}
