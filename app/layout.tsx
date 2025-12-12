import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inaá Studio",
  description: "Ferramenta para criação de projetos de modelagem",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
