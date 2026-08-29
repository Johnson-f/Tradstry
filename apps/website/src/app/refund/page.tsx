import type { Metadata } from "next";
import {
  Contact,
  LegalPage,
  type LegalSection,
} from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "How cancellations, withdrawals, and refunds work for Tradstry.",
  alternates: { canonical: "/refund" },
};

const SECTIONS: LegalSection[] = [
  {
    id: "merchant-of-record",
    heading: "Payments are handled by Paddle",
    body: (
      <>
        <p>
          Paddle is the Merchant of Record for paid Tradstry purchases. Paddle
          processes your payment, issues the receipt, calculates applicable
          transaction taxes, and handles approved refunds.
        </p>
        <p>
          Paddle's buyer terms and refund policy apply to purchases completed
          through Paddle, together with any mandatory consumer rights where you
          live.
        </p>
      </>
    ),
  },
  {
    id: "request",
    heading: "Requesting a refund",
    body: (
      <>
        <p>
          Start with the receipt or subscription-management link Paddle emailed
          after purchase, or visit{" "}
          <a href="https://paddle.net" rel="noreferrer">
            paddle.net
          </a>
          . You can also contact <Contact /> for product support or help locating
          a transaction.
        </p>
        <p>
          Refund eligibility depends on Paddle's current refund policy, your
          purchase, product use, and rights that apply in your country. Nothing
          on this page limits a refund or withdrawal right that cannot lawfully
          be waived.
        </p>
      </>
    ),
  },
  {
    id: "cancellation",
    heading: "Cancellation is different from a refund",
    body: (
      <>
        <p>
          You may cancel a subscription from your Tradstry billing settings.
          Cancellation stops the next renewal. Unless a refund or immediate
          cancellation applies, access normally continues until the end of the
          paid billing period.
        </p>
        <p>
          Canceling does not automatically refund earlier charges. Request a
          refund separately through Paddle if you believe a charge is eligible.
        </p>
      </>
    ),
  },
  {
    id: "access",
    heading: "Access after a refund",
    body: (
      <p>
        When Paddle refunds a paid plan, access to paid Tradstry features may end
        or return to the Free plan. Your account data remains subject to our{" "}
        <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.
      </p>
    ),
  },
];

export default function RefundPage() {
  return (
    <LegalPage
      title="Refund Policy"
      summary="Who handles refunds, how to request one, and what cancellation changes."
      sections={SECTIONS}
    />
  );
}
