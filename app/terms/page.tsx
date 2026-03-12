import type { Metadata } from "next";
import { PublicLegalPage } from "@/components/legal/PublicLegalPage";

const LAST_UPDATED = "March 12, 2026";

export const metadata: Metadata = {
  title: "Terms of Service | Adsecute",
  description: "Read the Adsecute Terms of Service.",
};

export default function TermsPage() {
  return (
    <PublicLegalPage title="Terms of Service" subtitle={`Last updated: ${LAST_UPDATED}`}>
      <p>
        These Terms of Service govern your access to and use of Adsecute. By using Adsecute, you
        agree to these terms.
      </p>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">1. Use of the Service</h2>
        <p className="mt-3">
          Adsecute provides analytics, reporting, and optimization intelligence for ecommerce
          marketing teams. You may use the service only for lawful business purposes.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">2. Accounts and Access</h2>
        <p className="mt-3">
          You are responsible for account credentials, team access controls, and activities under
          your account. You must provide accurate information and keep your access secure.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">
          3. Integrations and Third-Party Services
        </h2>
        <p className="mt-3">
          Adsecute connects to third-party platforms such as Shopify, Meta, Google, TikTok,
          Pinterest, Snapchat, and analytics providers. Your use of those services remains subject
          to their respective terms and policies.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">4. Acceptable Use</h2>
        <p className="mt-3">You agree not to misuse the service, including by:</p>
        <ul className="mt-3 list-disc space-y-1 pl-6">
          <li>attempting unauthorized access to systems or data</li>
          <li>interfering with service operations or reliability</li>
          <li>using Adsecute in violation of applicable law</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">5. Availability</h2>
        <p className="mt-3">
          We work to keep Adsecute available and reliable, but uninterrupted availability is not
          guaranteed.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">6. Limitation of Liability</h2>
        <p className="mt-3">
          To the maximum extent permitted by law, Adsecute is provided on an &quot;as is&quot;
          basis without warranties of any kind, and we are not liable for indirect, incidental, or
          consequential damages arising from use of the service.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">7. Changes</h2>
        <p className="mt-3">
          We may update these Terms from time to time. Updated terms become effective when posted
          on this page.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">8. Contact</h2>
        <p className="mt-3">
          Questions about these Terms can be sent to{" "}
          <a href="mailto:support@adsecute.com" className="underline underline-offset-2">
            support@adsecute.com
          </a>
          .
        </p>
      </section>
    </PublicLegalPage>
  );
}

