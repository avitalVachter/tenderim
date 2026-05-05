import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  subsets: ["latin", "hebrew"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: "תנדרים — מילוי מכרזים אוטומטי",
  description: "מלא מסמכי מכרז ממשלתיים בעזרת בינה מלאכותית",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body>{children}</body>
    </html>
  );
}
