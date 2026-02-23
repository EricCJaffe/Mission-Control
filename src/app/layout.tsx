import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { supabaseServer } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import UiFeedbackProvider from "@/components/UiFeedbackProvider";

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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-slate-900`}
      >
        {user ? (
          <AppShell userEmail={user?.email ?? null}>{children}</AppShell>
        ) : (
          <UiFeedbackProvider>
            <div className="min-h-screen">{children}</div>
          </UiFeedbackProvider>
        )}
      </body>
    </html>
  );
}
