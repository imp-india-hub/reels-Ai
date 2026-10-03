import "./globals.css";

export const metadata = {
  title: "ReelForge AI",
  description: "Turn any topic into a ready-to-share 7-scene reel."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}