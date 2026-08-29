import type { Metadata } from "next";
import {
  Contact,
  LegalPage,
  type LegalSection,
} from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Support",
  description: "Get product, account, brokerage-sync, and billing help for Tradstry.",
  alternates: { canonical: "/support" },
};

const SECTIONS: LegalSection[] = [
  {
    id: "product",
    heading: "Product and account support",
    body: (
      <p>
        For account access, brokerage sync, imported trades, calculations,
        notebook data, or Tradstry AI, contact <Contact />. Include the email on
        your Tradstry account and a short description of the problem. Never send
        a password, API key, or full payment-card number.
      </p>
    ),
  },
  {
    id: "billing",
    heading: "Billing and payment support",
    body: (
      <>
        <p>
          Paddle is the Merchant of Record for paid Tradstry purchases. Use the
          link in your Paddle receipt to view a transaction, update payment
          details, manage a subscription, or request a refund.
        </p>
        <p>
          For payment or receipt help directly from Paddle, visit{" "}
          <a href="https://paddle.net" rel="noreferrer">
            paddle.net
          </a>
          . For questions about the Tradstry product or access to paid features,
          contact <Contact />.
        </p>
      </>
    ),
  },
  {
    id: "safety",
    heading: "Trading and account safety",
    body: (
      <p>
        Tradstry cannot place, change, or cancel brokerage orders. For an urgent
        issue involving a brokerage account or a trade, contact your broker
        directly. Tradstry support cannot provide investment advice, trading
        signals, or recommendations.
      </p>
    ),
  },
];

export default function SupportPage() {
  return (
    <LegalPage
      title="Support"
      summary="Where to get help with Tradstry, your account, and Paddle billing."
      sections={SECTIONS}
    />
  );
}
