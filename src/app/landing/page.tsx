import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Dot — your life, one conversation.",
  description:
    "Dot lives in iMessage. Ask a question, handle a task, send a photo, or make what you need from one ongoing conversation.",
  alternates: { canonical: "https://textdot.co" },
  openGraph: {
    type: "website",
    url: "https://textdot.co",
    siteName: "Dot",
    title: "Dot — your life, one conversation.",
    description: "Ask a question. Handle a task. Make what you need, all from iMessage.",
    images: [{ url: "https://textdot.co/og.png", width: 1200, height: 630, alt: "Dot. Your life, one conversation." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dot — your life, one conversation.",
    description: "Ask a question. Handle a task. Make what you need, all from iMessage.",
    images: ["https://textdot.co/og.png"],
  },
};

export default function Landing() {
  return <LandingPage />;
}
