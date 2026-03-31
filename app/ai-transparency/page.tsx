import type { Metadata } from "next";
import { PublicLegalPage } from "@/components/legal/PublicLegalPage";

const LAST_UPDATED = "March 31, 2026";

export const metadata: Metadata = {
  title: "AI Transparency | Adsecute",
  description:
    "Learn how Adsecute uses OpenAI services for AI-powered insights, recommendations, and analysis.",
};

export default function AiTransparencyPage() {
  return (
    <PublicLegalPage title="AI Transparency" subtitle={`Last updated: ${LAST_UPDATED}`}>
      <p>
        Adsecute uses OpenAI services in selected product features to help generate AI-powered
        insights, analytical summaries, and recommendation support for merchants and marketing
        operators.
      </p>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">1. AI Services Used</h2>
        <p className="mt-3">
          Adsecute uses OpenAI as an AI service provider for selected workflows that involve
          natural-language analysis and AI-assisted interpretation of marketing and ecommerce data.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">2. What AI Is Used For</h2>
        <p className="mt-3">Depending on the connected features and workflows, Adsecute may use OpenAI services to:</p>
        <ul className="mt-3 list-disc space-y-1 pl-6">
          <li>generate marketing insight summaries</li>
          <li>support recommendation and decision-assistance workflows</li>
          <li>analyze advertising, landing page, SEO, and performance data</li>
          <li>produce operator-facing commentary and diagnostic explanations</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">3. Important Usage Note</h2>
        <p className="mt-3">
          AI-generated outputs are assistive. They are intended to support decision-making, not to
          replace human review, business judgment, or platform-specific validation before action is
          taken.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">4. Data Handling</h2>
        <p className="mt-3">
          Adsecute only uses AI in the context of product features designed to help merchants
          understand performance, recommendations, and operational opportunities. For more details
          about data handling and privacy, please review our Privacy Policy.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">5. Contact</h2>
        <p className="mt-3">
          If you have questions about how Adsecute uses AI services, contact{" "}
          <a href="mailto:support@adsecute.com" className="underline underline-offset-2">
            support@adsecute.com
          </a>
          .
        </p>
      </section>
    </PublicLegalPage>
  );
}
