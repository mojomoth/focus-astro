import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../pocs/ui/focus-astro.css";

export const metadata: Metadata = {
  title: "Focus Astro",
  description: "집중한 시간만큼 우주를 항해하는 집중 타이머",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080a10",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
