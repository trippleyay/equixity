import type { Metadata } from "next";
import PageHero from "@/components/site/PageHero";
import Container from "@/components/site/Container";
import LegalDocument, {
  type LegalSection,
} from "@/components/site/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy - Equixity",
  description:
    "How Equixity collects, uses, shares, and protects personal data for merchants and customers.",
};

const sections: LegalSection[] = [
  {
    heading: "1. Who this policy covers",
    paragraphs: [
      "This Privacy Policy explains how Equixity handles personal data when you use our website, merchant dashboard, APIs, checkout integration, or reward-claim service. You can contact us through the Equixity contact page at /contact.",
      "Equixity is the controller or business responsible for the personal data described in this Policy. Depending on your role, we handle data as a merchant account holder or administrator, a customer, a visitor, or a person whose information a Merchant or payment provider provides to us. “Personal data” includes information that identifies or can reasonably be linked to a person or device.",
    ],
  },
  {
    heading: "2. Product mechanics that affect the data flow",
    paragraphs: [
      "A Merchant configures a third-party tokenized-stock reward and reports completed purchases through a signed Stripe or Flutterwave webhook or through an authenticated call from the Merchant’s backend. Equixity calculates a reward and records it for the Customer.",
      "Rewards are delivered to a Solana wallet. A Customer may paste an existing address or use Privy to create an embedded wallet with email or Google authentication. The current Customer checkout is fiat-only, but reward assets are transferred and recorded on the Solana blockchain. This wallet and blockchain processing are part of the service even when the purchase interface does not use cryptocurrency terminology.",
    ],
  },
  {
    heading: "3. Data we collect, why we collect it, and our legal bases",
    paragraphs: [
      "We collect only information reasonably needed to operate, secure, support, and comply for the service. Depending on the context, we rely on performing a contract, complying with a legal obligation, protecting the service and users, pursuing legitimate interests, or obtaining consent where consent is legally required.",
    ],
    bullets: [
      "Merchant account and contact data: business name, Merchant name, account email, identifiers, creation and update times, and authentication records. We use this to create and secure the account, administer rewards, communicate about service issues, and keep audit records. Legal bases typically are contract, legal obligation, and legitimate interests in security and administration.",
      "Reward and Merchant configuration: selected tokenized-stock asset, reward percentage, whether rewards are enabled, the Merchant’s eligibility confirmation, and the receiving wallet address used by supported integrations. We use this to determine reward records and delivery routes. This is necessary to perform the service; inaccurate data may cause rejection of a report or claim.",
      "Merchant connection credentials: generated API-key metadata, cryptographic hashes used to identify API keys, and encrypted Stripe or Flutterwave webhook secrets. We use these solely to authenticate integration calls and verify webhook signatures. Keys are shown in full only when generated or created; Merchant withdrawal and deposit private keys are encrypted and are not returned by an API. These are security credentials and should not be submitted to us except through the designated setup flow.",
      "Merchant funding and transaction data: Equixity deposit address, USDC balance, funding and withdrawal records, on-chain transaction signatures, withdrawal destination addresses, amounts, status, and timestamps. We use this to fund rewards, execute and reconcile withdrawals, prevent duplicate or insufficient transactions, and maintain financial records.",
      "Customer purchase data: purchase amount, order/session identifier, currency, transaction or claim status, reward asset and quantity, and the Merchant’s reward rate. Usually, this is sent by the payment provider’s webhook or by the Merchant’s backend, not entered directly by the Customer. We use it to create a reward, prevent duplicate reporting, calculate the reward, and resolve delivery and support issues.",
      "Customer wallet and chain data: a pasted wallet address, or the Solana address linked to a Privy wallet; claim method; asset, quantity, swap and transfer transaction signatures; confirmation, failure, and eligibility status; and necessary timestamps. We use this to screen destination addresses, deliver the reward, confirm the transaction on-chain, prevent reuse, and reconcile uncertain outcomes. Solana transaction and token information may also be publicly visible through explorers and other network participants.",
      "Eligibility data: the two-letter country code derived from the Customer’s IP address, the Customer’s required attestation, the screening result, and any associated block reason. We use this only to determine and document whether the Customer may receive the restricted tokenized security. If the country cannot be identified in production, delivery is blocked. We do not use this location value to build an advertising profile.",
      "Customer backup contact: when Stripe or Flutterwave provides an email in a webhook, we store it as a possible backup contact for a reward that remains unclaimed. We intend to use it only for a service or reward-status notice. It is not collected for marketing. The direct backend API path currently does not provide this email.",
      "Privy identity and authentication data: when a Customer chooses an embedded wallet, we receive Privy tokens and the identity, linked Solana address, authentication method, and related wallet record from Privy. The Customer gives an email address or chooses Google authentication. We use this to verify that the request is associated with the same Privy user, resolve the server-verified destination wallet, and prevent a browser from supplying an unverified destination. Privy may process identity and wallet information under its own privacy terms.",
      "Security and technical data: IP address for rate limiting, abuse prevention, and security logging; country derived from the IP; user agent, request time, endpoint, and security-event details that our infrastructure or logs provide. We use this to prevent abuse, protect accounts and reward delivery, investigate suspicious activity, and maintain security and audit records.",
      "Website, dashboard, and contact data: pages and features used, approximate timestamps and diagnostics, and information you submit to the contact form, such as name, email, subject, and message. We use this to operate, improve, secure, and respond to the service or request.",
      "Communications: support messages and relevant account correspondence. We use this to answer requests, manage claims, document decisions, and meet legal obligations. Do not send payment-card numbers, passwords, API keys, webhook secrets, or private keys through the contact form or ordinary support email.",

    ],
  },
  {
    heading: "4. How we share personal data",
    paragraphs: [
      "We share personal data only as described below, with the service providers needed to operate the relevant flow, where a Merchant has instructed us to do so, to protect the service, or when required by law. Providers may use data for their own security, compliance, and service-delivery purposes under their terms.",
    ],
    bullets: [
      "Supabase: hosts our database, authentication, and application data. It receives merchant profiles, configuration, credentials, financial records, customer reward and eligibility records, and support/account data stored by Equixity.",
      "Privy: receives authentication and identity data when a Customer chooses an embedded wallet, creates or retrieves the Solana wallet, provides the linked address, and helps Equixity verify the associated user. Equixity does not receive the Customer’s seed phrase or private key from this integration.",
      "Stripe and Flutterwave: receive and process Customer payment transactions under their own policies. Their signed webhooks or Merchant backend reports provide Equixity with the purchase amount, order/session identifier, status, currency, and sometimes an email. We also retain each Merchant’s encrypted webhook signing secret where required to verify the provider’s event. These providers are not used to offer a crypto payment option in the current Customer checkout.",
      "Vercel: hosts the application and supplies request, geolocation, and security data. Vercel may provide the IP-derived country used for reward eligibility and may process request logs and IP addresses for hosting and security.",
      "Upstash: provides Redis-based rate limiting. API keys are represented by hashes before use as rate-limit identifiers; IP-based identifiers may be sent to Upstash to limit abuse and protect reward-delivery endpoints.",
      "Alchemy: provides Solana RPC infrastructure. It receives the network requests needed to read token accounts, balances, and transactions, including relevant Solana addresses and transaction identifiers.",
      "Jupiter: supplies pricing/swap routing and transaction instructions. It receives transaction parameters and wallet/token addresses needed to convert held USDC into the selected reward asset around delivery.",
      "Solana network participants, including validators and block explorers: the destination address, token type, amount, and public transaction information become part of blockchain records when a reward is delivered. Blockchain information is not generally editable or deletable through Equixity after confirmation.",
      "Professional advisers, regulators, law enforcement, or other authorities: where required for legal compliance, safety, fraud prevention, or protection of rights. We will disclose only what is legally required or reasonably necessary, subject to applicable law.",
      "A Merchant and its service providers: we provide the Merchant-specific reward and integration data necessary to operate the Merchant’s program. We do not give one Merchant another Merchant’s private credentials or customer list.",
    ],
  },
  {
    heading: "5. International transfers and data locations",
    paragraphs: [
      "Equixity and its providers may process data in countries other than the Customer’s or Merchant’s country of residence. We use appropriate safeguards for international transfers where required by applicable law.",
    ],
  },
  {
    heading: "6. Retention",
    paragraphs: [
      "We retain personal data only for as long as reasonably needed for the purposes described, including to provide and reconcile rewards, provide support, prevent fraud, comply with tax, accounting, sanctions, and other legal requirements, enforce agreements, and resolve disputes. Records that must be corrected or preserved after a claim are retained until the applicable claim, refund, limitation, and compliance periods end.",
      "Merchant credentials, blockchain records, order identifiers, eligibility evidence, and financial/audit records have different retention needs and cannot always be deleted from a public blockchain. When a Merchant closes its account, we may retain or securely archive required information, remove or anonymize data that can lawfully be removed, and keep suppression records only as necessary to honor opt-outs or legal restrictions.",
    ],
  },
  {
    heading: "7. Security and custody boundaries",
    paragraphs: [
      "We use access controls, database row-level security, encryption in transit, encryption of sensitive stored credentials and Merchant deposit keys, web/API-key authentication, rate limits, transaction verification, and operational monitoring. No method is completely secure.",
      "A pasted wallet address is a public blockchain identifier. A Privy embedded wallet is created and its key infrastructure is managed under Privy’s terms when the Customer chooses that option. Equixity verifies and uses the linked address for delivery but does not receive the seed phrase or private key and does not guarantee access, recovery, or continued wallet availability. Customers should protect their Privy account and authentication methods.",
      "Neither Equixity nor its providers can guarantee absolute security, continuous availability, or recovery from every loss, fraud, network failure, software defect, or blockchain error.",
    ],
  },
  {
    heading: "8. Cookies and similar technologies",
    paragraphs: [
      "The current service uses strictly necessary authentication, session, security, and load-balancing technologies. These may set cookies or use similar browser/server storage to keep a Merchant signed in, protect routes, remember state, and prevent abuse. Because these technologies are necessary for the service requested, they are not used as optional advertising cookies.",
      "If Equixity introduces analytics or non-essential cookies, it will update this Policy, provide required consent controls where applicable, and honor applicable opt-out rights.",
    ],
  },
  {
    heading: "9. Your choices and rights",
    paragraphs: [
      "Depending on where you live, you may have rights to access, correct, delete, restrict, object to, or receive a copy of personal data; withdraw consent; complain to a data-protection authority; opt out of certain processing; and limit or opt out of certain sales or sharing under laws such as the GDPR, UK GDPR, or CCPA/CPRA. Availability of these rights and exemptions depends on your location, role, and the data involved.",
      "To exercise a right, contact us through the Equixity contact page with enough information for us to identify your account or reward. We may ask for reasonable verification and may retain information where an exemption or legal obligation applies. We may need to verify with the Merchant that data it provided is legally within our control. We do not sell personal data for money. We do not knowingly share personal data for cross-context behavioral advertising.",
      "We generally do not make decisions based solely on automated processing that produces legal or similarly significant effects. Reward calculations are automated but do not determine whether a Merchant’s sale is genuine or decide a Customer’s tax treatment. Human review and support can be requested where the relevant right applies.",
      "A Customer may withdraw an attestation or stop a claim by contacting us before a transaction is finalized, but withdrawal does not require us to reverse a completed blockchain transfer that cannot lawfully or technically be reversed. A correction request may not change immutable blockchain facts; we may instead correct the associated Equixity record or explain the limitation.",
    ],
  },
  {
    heading: "10. Children",
    paragraphs: [
      "The service is intended for businesses and adults who can enter a binding contract. Equixity does not knowingly direct the service to children under 16 and does not knowingly collect personal data from them.",
    ],
  },
  {
    heading: "11. Changes to this Policy",
    paragraphs: [
      "We may update this Policy when our service, providers, or legal obligations change. We will post the revised version with a new Effective Date and provide additional notice or obtain consent where required. We will not use a revised Policy to expand collection retroactively without the notice or consent required by law.",
    ],
  },
  {
    heading: "12. Contact, complaints, and Effective Date",
    paragraphs: [
      "Questions, requests, and complaints can be sent through the Equixity contact page. We ask that you contact us first so we can try to resolve the issue. You may also have the right to complain to the data-protection or consumer-protection authority in your place of residence or the place where you believe the violation occurred.",
      "This Policy is effective when Equixity publishes it. We may update it when the service, providers, or legal requirements change.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy Policy">
        This policy explains what information the rewards service receives,
        how it is used, and which processors and blockchain participants are
        involved.
      </PageHero>
      <Container className="px-0">
        <LegalDocument sections={sections} />
      </Container>
    </>
  );
}
