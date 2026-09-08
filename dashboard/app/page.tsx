import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { landingInter } from "@/components/landing/fonts";

export const metadata: Metadata = {
  title: "LeaseOps | After-hours leasing assistant",
  description:
    "Watch LeaseOps answer, qualify, and book tours for rental inquiries after hours — then try the live voice agent yourself.",
};

export default function Home() {
  return <LandingPage className={landingInter.className} />;
}
