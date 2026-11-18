import "./style.css";
import type { ReactNode } from "react";
export const metadata = { title: "Cadence", description: "A private marketing content workspace." };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
