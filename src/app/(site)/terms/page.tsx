import type { Metadata } from "next";
import PageHero from "@/components/site/PageHero";
import Container from "@/components/site/Container";
import LegalDocument, {
  type LegalSection,
} from "@/components/site/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Service - Equixity",
  description:
    "Terms governing merchant use of Equixity and customer receipt of tokenized-stock rewards.",
};

const sections: LegalSection[] = [
  {
    heading: "1. Agreement and who these terms cover",
    paragraphs: [
      "These Terms of Service (the “Terms”) form a binding agreement between Equixity and the person or business agreeing to them. You can contact us through the Equixity contact page at /contact.",
      "These Terms apply to: (a) a business that registers for, configures, funds, or uses an Equixity merchant account (a “Merchant”); (b) that Merchant’s authorized users; and (c) a customer who uses a Merchant’s checkout and attempts to claim a reward (a “Customer”). Each Merchant and Customer accepts these Terms by using the applicable service, creating an account, or claiming a reward. If a Merchant’s terms conflict with these Terms, these Terms govern the Equixity service only.",
      "You must be legally able to enter a binding contract and at least 18 years old. If you use Equixity for a business, you confirm that you have authority to bind that business.",
    ],
  },
  {
    heading: "2. What Equixity is, and what it is not",
    paragraphs: [
      "Equixity is a rewards-distribution platform. A Merchant chooses a supported third-party tokenized-stock product, chooses the percentage of an eligible sale allocated to rewards, and reports completed purchases to us. Equixity calculates and arranges delivery of the corresponding reward to a Customer’s Solana wallet.",
      "The reward asset is a third-party tokenized security product, such as an xStock or PreStock. The relevant third-party company, not Equixity, issues that asset. Equixity neither owns nor controls the issuer, the asset, its mint, its legal terms, or the underlying market referenced by it. The token represents the economic exposure specified by the issuer; it is not, by itself, a share of the issuer or the referenced company and does not automatically give a holder voting, dividend, legal-owner, redemption, or other shareholder rights. The issuer’s current offering, risk, and legal documents control those matters.",
      "Equixity acts as a distributor and delivery facilitator. It is not an issuer, broker, dealer, investment adviser, custodian, exchange, bank, or merchant of a security for its own account. We do not recommend a security, select it for a Customer, or provide individualized investment, tax, or legal advice.",
    ],
    notice:
      "“Tokenized stock” is a blockchain-based representation. It is not cash, a deposit, or a guaranteed value. Read the issuer’s documents and obtain your own professional advice before deciding what to do with a reward.",
  },
  {
    heading: "3. Eligibility and restricted jurisdictions",
    paragraphs: [
      "The availability of third-party tokenized securities is limited by law and by the issuers’ own terms. Before delivery, Equixity checks the country derived from the Customer’s IP address, requires the Customer’s affirmative attestation, validates the destination wallet, and applies any then-current sanctions screening. The Merchant must separately confirm that it will not offer or enable Equixity rewards to Customers in restricted locations.",
      "Currently, rewards may not be offered, claimed, or delivered to a U.S. Person or to a person who is a resident of or located in the United States, the United Kingdom, Canada, Australia, or Mainland China. Rewards also may not be offered, claimed, or delivered in any jurisdiction subject to sanctions administered by the U.S. Department of the Treasury’s Office of Foreign Assets Control (OFAC), including Cuba, Iran, North Korea, and Syria. This list may change without notice as law, sanctions, issuer availability, or our compliance program changes.",
      "By proceeding, you represent that you are not a U.S. Person, are not resident in or located in a restricted jurisdiction, are not acting for a prohibited person or purpose, and are eligible under the issuer’s terms. You must provide accurate information and stop any claim if your location or status changes. If location cannot be determined, the claim will not be delivered in production. VPN, proxy, inaccurate addressing, or a false attestation may cause rejection or suspension.",
      "Equixity may delay, block, cancel, or withhold delivery before, during, or after a claim if it reasonably determines that eligibility, sanctions, law, issuer terms, fraud prevention, or technical integrity requirements are not satisfied. We have no duty to deliver a reward in a restricted or unverifiable location. A compliance block is not a technical failure and does not require a replacement reward in cash, points, or another asset.",
    ],
  },
  {
    heading: "4. Merchant responsibilities",
    paragraphs: [
      "A Merchant is solely responsible for its business, storefronts, checkout, customer communications, legal compliance, funding, and the decision to offer rewards. A Merchant must use the service only for genuine completed sales, keep sufficient available funds on Equixity, and not submit duplicate, fraudulent, test, cancelled, refunded, reversed, or otherwise ineligible orders as reward-eligible purchases.",
      "The Merchant decides which asset it offers and the percentage of each eligible sale allocated to it. That percentage is applied using the purchase amount and reward rate associated with the event. Changes do not retroactively reprice a reward already recorded. Equixity may reject an event or suspend a Merchant if the report is inaccurate, incomplete, unauthorized, duplicated, or connected to prohibited activity.",
      "For a Stripe or Flutterwave webhook, the Merchant is responsible for configuring the processor correctly and keeping its signing secret confidential. For a direct backend call, the Merchant must protect its API key and authenticate requests through Equixity. A Merchant must not expose a secret in client-side code, logs, analytics, or public repositories. API keys and webhook secrets are for the Merchant’s own use and may be rotated or revoked at any time.",
      "Equixity may record completed purchase information from a signed Stripe or Flutterwave webhook or from a Merchant’s authenticated backend. Equixity does not independently determine whether a card purchase represented a genuine, final, non-refunded transaction between the Merchant and Customer. Any dispute about whether a purchase happened, its amount, refund status, eligibility under the Merchant’s promotion, or the Merchant’s obligation to honor it is between the Merchant and Customer. Equixity may correct obvious duplicate or malformed reports but does not arbitrate those disputes and may ask the Merchant to substantiate a report.",
    ],
  },
  {
    heading: "5. Customer purchase and reward rights",
    paragraphs: [
      "The Customer’s purchase is with the Merchant, not Equixity. The Merchant determines the product, price, refund rights, taxes charged, and the commercial terms of the sale. The fact that a purchase creates a reward does not make Equixity a party to that sale or a guarantor of the Merchant’s goods, services, refunds, or obligations.",
      "A reward is not a promised fixed cash amount. The displayed US-dollar allocation is a calculation used to determine the quantity of the selected token at the event’s applicable price and reward rate. Market price, asset pricing, liquidity, token conversion, network fees, and other conditions may change. The quantity shown, if any, is not a promise of future monetary value.",
      "Reward ownership remains subject to successful delivery or transfer on the Solana blockchain, applicable law, and the issuer’s terms. Neither Equixity nor the Merchant promises that a token will remain listed, supported, transferable, redeemable, or economically equivalent to a conventional share. A token may be frozen, restricted, delisted, or otherwise impaired by the issuer or network even if Equixity has not acted.",
    ],
  },
  {
    heading: "6. Wallet selection, embedded wallets, and custody",
    paragraphs: [
      "A Customer claiming through a card-based purchase must choose a destination. The Customer may paste an existing Solana address or ask Equixity to arrange an embedded wallet through Privy. The current card checkout is fiat-only; Equixity does not offer Customers a crypto payment option through that checkout. The reward asset is nevertheless delivered using blockchain transactions.",
      "If the Customer pastes an address, the Customer is responsible for entering an address the Customer is authorized to use and able to access. Equixity validates the format and may screen it, but cannot test ownership, prevent every typo, or recover funds sent to a wrong or inaccessible address. A blockchain transfer selected by the Customer cannot ordinarily be reversed by Equixity, the Merchant, or the Customer.",
      "If the Customer chooses “set one up for me” and signs in through Privy using email or Google, Privy’s infrastructure creates or retrieves an embedded Solana wallet and manages the wallet’s key infrastructure under Privy’s applicable terms. Equixity verifies the Privy identity and obtains the linked wallet address for delivery, but does not receive a seed phrase or Customer private key. Control, recovery, authentication, and key-management obligations are governed by the Customer’s Privy arrangement and are not an Equixity guarantee. The Customer is responsible for protecting the Privy account and its authentication methods.",
      "The Customer is solely responsible for all taxes, duties, reports, and filings arising from purchase, receipt, ownership, transfer, valuation, sale, or other use of a reward. Equixity does not determine a Customer’s tax residence or tax treatment, and the Merchant’s description of a reward does not provide tax advice.",
    ],
  },
  {
    heading: "7. Reward calculation, delivery, and technical risk",
    paragraphs: [
      "Equixity converts the Merchant’s funded USDC into the selected reward asset through Jupiter at or around delivery and sends the asset to the Customer’s selected Solana address. The chain transaction, wallet availability, network congestion, token controls, smart contracts, oracle or price sources, counterparties, and other systems can cause delay, partial failure, or loss. Public blockchains are decentralized and generally irreversible.",
      "Equixity records a claim outcome only after checking the relevant transaction on-chain. If a transaction is definitively not executed, Equixity ordinarily releases the reserved amount back to the Merchant’s available reward funding. If a swap has already succeeded but delivery to the Customer cannot be established, Equixity may retain and reconcile the swapped asset rather than risk paying twice; that does not grant the Customer a substitute reward. A claim marked as claiming or pending may require later reconciliation and should not be treated as delivered until confirmed.",
      "Merchants, not Equixity, are responsible for deciding how to handle a customer-service issue caused by an unclaimed, delayed, failed, or withheld reward. The Merchant is responsible for its customer promises, subject to these Terms. Equixity may investigate apparent fraud, duplicate orders, credential compromise, sanctions indicators, or technical inconsistencies and may preserve relevant records while doing so.",
      "Do not interact with Equixity, Privy, or a reward through a link you did not expect. Confirm the destination and understand the asset and network before approving a transaction.",
    ],
  },
  {
    heading: "8. Accounts, security, and suspension",
    paragraphs: [
      "You are responsible for accurate account information, confidential credentials, and activity under your control. Notify us promptly of suspected unauthorized use. We may use verification, rate limits, access controls, and transaction screening to protect the service, but no online system is completely secure.",
      "We may suspend or limit a Merchant account or claim, restrict access, withhold a reward, preserve records, or decline a transaction to address a suspected security incident, fraud, sanctions exposure, inaccurate Merchant reporting, misuse of credentials, infringement, unlawful content or activity, a material breach of these Terms, or a requirement imposed by an issuer or law. We will use reasonable efforts to restore service when the concern is resolved.",
      "Ending a Merchant account does not transfer a Customer’s rights under the Merchant’s policies to Equixity. Surviving obligations include recordkeeping, tax, dispute, liability, and other provisions that by their nature should survive.",
    ],
  },
  {
    heading: "9. Third-party services and issuer independence",
    paragraphs: [
      "Equixity relies on third parties, including payment processors, Privy, Supabase, hosting and network infrastructure providers, Jupiter, and the Solana network. A third party may refuse a service, become unavailable, change its rules, or fail. Those services are governed by their own terms, and Equixity does not promise uninterrupted or error-free operation.",
      "Third-party issuers are independent of Equixity. References to an asset, issuer, or market do not mean Equixity endorses or controls it. The issuer may amend, suspend, freeze, or terminate a token or related rights. Questions about the token’s legal rights, backing, reserves, redemption, suitability, or continued operation should be directed to the issuer.",
      "Our Privacy Policy explains the personal-data practices and service providers associated with the service.",
    ],
  },
  {
    heading: "10. Intellectual property and acceptable use",
    paragraphs: [
      "Equixity and its licensors own the service, software, branding, documentation, and related materials. These Terms grant only a limited, revocable, non-transferable right to use the service for its intended purpose. No other rights are granted by implication or estoppel.",
      "You may not reverse engineer, copy, frame, scrape, overload, bypass controls, probe the service without authorization, misrepresent your identity, interfere with operation, upload malicious code, scrape Customer data, misuse credentials, or use Equixity in violation of law, sanctions, issuer terms, or third-party rights. You must not represent that Equixity guarantees an asset’s value, manages Customer investments, or provides investment advice.",
    ],
  },
  {
    heading: "11. Confidentiality and publicity",
    paragraphs: [
      "Each party should protect non-public information received from the other and use it only to perform under these Terms. These duties do not apply to information independently developed, already lawfully known, rightfully received from another source, or required to be disclosed by law after reasonable notice where lawful. Secrets, API keys, webhook secrets, and security information remain subject to appropriate protection.",
      "Neither party may use the other’s name, marks, or customer stories in publicity without prior written consent. These Terms do not grant trademark or publicity rights.",
    ],
  },
  {
    heading: "12. Disclaimer of warranties",
    paragraphs: [
      "To the fullest extent permitted by law, the service, reward, and all related content are provided “as is” and “as available.” Equixity disclaims express, implied, and statutory warranties, including merchantability, fitness for a particular purpose, title, non-infringement, accuracy, availability, and uninterrupted or error-free operation. Equixity does not warrant that a reward will be issued, delivered, accepted, liquid, profitable, equal to a share of a company, or capable of recovering a particular value.",
      "Nothing in these Terms excludes a warranty or right that cannot lawfully be excluded, including applicable statutory consumer rights or implied warranties for services supplied under a law that does not permit their exclusion.",
    ],
  },
  {
    heading: "13. Limitation of liability",
    paragraphs: [
      "To the fullest extent permitted by law, Equixity, its affiliates, and their personnel, contractors, agents, and providers will not be liable for indirect, incidental, special, exemplary, punitive, or consequential damages, or for lost profits, loss of opportunity, loss of goodwill, or loss or corruption of data, arising from or related to the service, rewards, blockchain use, or these Terms, even if advised such damages were possible.",
      "To the fullest extent permitted by law, each party’s aggregate liability arising from or relating to these Terms will be limited to the amount that law permits us to limit it to.",
      "Nothing in these Terms excludes liability that cannot lawfully be excluded, including liability for fraud, fraudulent misrepresentation, or a death or personal injury caused by negligence, to the extent applicable.",
    ],
  },
  {
    heading: "14. Indemnity",
    paragraphs: [
      "Each party is responsible for claims arising from its own breach of these Terms, unlawful conduct, or violation of third-party rights. Nothing in this section limits rights or liability that cannot lawfully be limited.",
    ],
  },
  {
    heading: "15. Changes, assignment, and notices",
    paragraphs: [
      "We may update these Terms for legal, compliance, security, product, or operational reasons. We will post the updated version with a revised Effective Date and provide additional notice where required. If a change materially affects a pending claim, the Terms in effect when the reward event was created will govern that claim to the extent required by law, unless the change is necessary to comply with law or a mandatory issuer restriction.",
      "You may not assign these Terms without our written consent. We may assign these Terms to an affiliate or successor in connection with a reorganization, merger, change of control, or transfer of the relevant business, subject to applicable law. Continued use after assignment constitutes acceptance where legally permitted.",
      "Legal notices to Equixity may be sent through the Equixity contact page. Notices are effective when we receive them. We may provide operational notices through the service or the account email.",
    ],
  },
  {
    heading: "16. Governing law and disputes",
    paragraphs: [
      "These Terms and any dispute arising from them are governed by the laws that apply where the relevant service is provided, without regard to conflict-of-law rules that would require another law. The appropriate forum or dispute process depends on the parties’ location and the law that applies.",
      "Before filing a formal proceeding, each party agrees to contact us through the Equixity contact page and make a good-faith effort to resolve the issue. This does not delay a deadline for legal action or prevent urgent injunctive or protective relief.",
    ],
  },
  {
    heading: "17. Effective Date",
    paragraphs: [
      "These Terms are effective when Equixity publishes them. We may update them as the product, security posture, providers, or legal requirements change.",
    ],
  },
];

export default function TermsPage() {
  return (

    <>
      <PageHero eyebrow="Legal" title="Terms of Service">
        These terms explain the rewards service for businesses and customers,
        including tokenized assets, Merchant reporting, restricted locations,
        wallets, and delivery risk.
      </PageHero>
      <Container className="px-0">
        <LegalDocument sections={sections} />
      </Container>
    </>
  );
}
