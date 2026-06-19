import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIQMS3 — Quản lý ĐBCL & Kiểm định CTĐT",
  description:
    "Hệ thống quản lý đảm bảo chất lượng và kiểm định chương trình đào tạo tích hợp AI",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
