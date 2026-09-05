import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "PeoplePay360 · HR & Payroll",
  description: "People, time and payroll in one connected workspace.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script id="peoplepay360-theme" strategy="beforeInteractive">{`(function(){try{var p=localStorage.getItem('peoplepay360-theme');document.documentElement.dataset.ppTheme=(p==='light'||p==='dark')?p:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){document.documentElement.dataset.ppTheme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}})();`}</Script>
        {children}
      </body>
    </html>
  );
}
