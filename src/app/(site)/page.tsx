import Hero from "@/components/home/Hero";
import BusinessSteps from "@/components/home/BusinessSteps";
import CustomerSteps from "@/components/home/CustomerSteps";
import OwnershipCompare from "@/components/home/OwnershipCompare";
import FinalCta from "@/components/home/FinalCta";

export default function Home() {
  return (
    <>
      <Hero />
      <BusinessSteps />
      <CustomerSteps />
      <OwnershipCompare />
      <FinalCta />
    </>
  );
}
