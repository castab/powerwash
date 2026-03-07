import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Powerwash Booking",
    template: "%s | Powerwash Booking",
  },
  description:
    "Mobile-first car wash booking and admin management built with Next.js, Prisma, PostgreSQL, and Stripe.",
  applicationName: "Powerwash Booking",
  metadataBase: new URL("https://example.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
