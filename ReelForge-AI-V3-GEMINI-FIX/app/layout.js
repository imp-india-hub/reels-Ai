import "./globals.css";
export const metadata = { title: "ReelForge AI", description: "AI reel generator" };
export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}