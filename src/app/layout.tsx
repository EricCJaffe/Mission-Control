import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { supabaseServer } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TacPastor’s Mission Control",
  description: "Personal-first system for projects, tasks, notes, and alignment.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gradient-to-br from-stone-50 via-slate-50 to-blue-50 text-slate-900`}
      >
        <div className="min-h-screen md:flex">
          <Sidebar userEmail={user?.email ?? null} />
          <div className="flex-1 px-6 pb-16 md:pl-0">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
