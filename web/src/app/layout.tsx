import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RtviProvider } from "@/components/voice/rtvi-provider";
import { VoiceDock } from "@/components/voice/voice-dock";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PRM — Personal Relation Manager",
  description:
    "Remember the people who matter. A mobile-first personal relationship manager with an optional voice agent.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-muted/40">
        <RtviProvider>
          {/* Mobile-first centered app frame. The voice dock floats at the bottom. */}
          <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background shadow-sm ring-1 ring-border/50">
            {children}
          </div>
          <VoiceDock />
          <Toaster position="top-center" richColors />
        </RtviProvider>
      </body>
    </html>
  );
}
