import type { Metadata } from "next";
import { Assistant } from "next/font/google";
import "./globals.css";

const assistant = Assistant({
  variable: "--font-sans",
  subsets: ["latin", "hebrew"],
});

export const metadata: Metadata = {
  title: "ShayFinance",
  description: "לוח בקרה פיננסי אישי",
};

/**
 * Runs synchronously in <head> before first paint: stamp data-theme on <html>
 * from the stored preference, falling back to the OS `prefers-color-scheme`.
 * Doing this in a mount effect instead would paint light first and flash on a
 * dark load, and diverge from SSR markup (hydration mismatch) — #109 line-item
 * 4. Keep the localStorage key in sync with THEME_STORAGE_KEY in theme-provider.
 */
const themeScript = `(function(){try{var t=localStorage.getItem("shayfinance-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${assistant.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-background text-foreground flex min-h-full flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
