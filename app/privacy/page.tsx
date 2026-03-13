import type { Metadata } from "next";
import { PublicLegalPage } from "@/components/legal/PublicLegalPage";

const LAST_UPDATED = "March 13, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy | Adsecute",
  description:
    "Read the Adsecute Privacy Policy, including how merchant data is collected, used, and protected.",
};

export default function PrivacyPage() {
  return (
    <PublicLegalPage title="Privacy Policy" subtitle={`Last updated: ${LAST_UPDATED}`}>
      <p>
        Adsecute provides advertising intelligence and analytics tools for ecommerce businesses.
        This Privacy Policy explains how we collect, use, and protect merchant data when using
        Adsecute.
      </p>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">1. Information We Collect</h2>
        <p className="mt-3">
          Adsecute may access and process certain business data through integrations authorized by
          the merchant, including:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-6">
          <li>
            advertising performance data from platforms such as Meta Ads, Google Ads, TikTok Ads,
            Pinterest Ads, and Snapchat Ads
          </li>
          <li>
            ecommerce data from Shopify, including store, product, order, and revenue-related
            information
          </li>
          <li>
            analytics data from services such as Google Analytics 4 and Google Search Console
          </li>
        </ul>
        <p className="mt-3">
          Adsecute is designed to process business performance data to provide reporting,
          optimization insights, and decision support.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">2. How We Use Data</h2>
        <p className="mt-3">We use authorized data to:</p>
        <ul className="mt-3 list-disc space-y-1 pl-6">
          <li>provide dashboards, analytics, and reporting</li>
          <li>generate optimization recommendations and insights</li>
          <li>
            help merchants understand campaign, creative, landing page, and copy performance
          </li>
          <li>improve the Adsecute product and user experience</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">3. Data Sharing</h2>
        <p className="mt-3">
          Adsecute does not sell or rent merchant data. We do not share merchant data with third
          parties except where necessary to operate the service, comply with law, or support
          authorized integrations and infrastructure providers.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">4. Data Security</h2>
        <p className="mt-3">
          We use reasonable technical and organizational safeguards to protect merchant data
          against unauthorized access, disclosure, alteration, or destruction.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">5. Data Retention</h2>
        <p className="mt-3">
          We retain data only for as long as needed to provide the service, comply with legal
          obligations, resolve disputes, and enforce agreements.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">6. Third-Party Services</h2>
        <p className="mt-3">
          Adsecute integrates with third-party services including Shopify, Meta, Google, TikTok,
          Pinterest, Snapchat, and analytics providers. Use of those services is also subject to
          their own terms and privacy policies.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">7. Merchant Responsibility</h2>
        <p className="mt-3">
          Merchants are responsible for ensuring they have the right to connect and process data
          from the systems they authorize with Adsecute.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">8. Changes to This Policy</h2>
        <p className="mt-3">
          We may update this Privacy Policy from time to time. Any updates will be posted on this
          page with a revised effective date.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">9. User Data Deletion Requests</h2>
        <p className="mt-3">
          You may request deletion of personal data associated with your Adsecute account by
          contacting{" "}
          <a href="mailto:support@adsecute.com" className="underline underline-offset-2">
            support@adsecute.com
          </a>
          . To help us locate the correct account or workspace safely, please include identifying
          information such as your name, email address, business or workspace name, and any
          connected platform details relevant to the request.
        </p>
        <p className="mt-3">
          If your request relates to Meta or Facebook-connected data, you may also remove Adsecute
          from your Facebook or Meta business settings and revoke the app&apos;s access directly
          through your Meta account controls. Disconnecting an integration helps prevent future data
          access, but it does not automatically delete records that were previously stored in
          Adsecute.
        </p>
        <p className="mt-3">
          After receiving a valid request, we will review it and process deletion in accordance
          with applicable legal obligations, security requirements, billing needs, fraud-prevention
          controls, audit obligations, and operational retention requirements. Where full deletion
          cannot be completed immediately, we may restrict access to the relevant data and retain it
          only as required for those purposes.
        </p>
        <p className="mt-3">
          Where an individual user is part of a shared business or workspace, deletion of that
          user&apos;s personal account information may be handled separately from deletion of shared
          business configuration, reporting history, synced performance data, or other records that
          belong to the business account as a whole. We will evaluate each request based on the
          relationship between the requesting user and the relevant business data.
        </p>
        <p className="mt-3">
          We aim to review deletion requests promptly and will communicate next steps if we need
          additional information to verify the request. Processing times may vary depending on the
          scope of the request and any retention obligations that apply.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">10. Contact</h2>
        <p className="mt-3">
          If you have questions about this Privacy Policy, contact:{" "}
          <a href="mailto:support@adsecute.com" className="underline underline-offset-2">
            support@adsecute.com
          </a>
        </p>
      </section>
    </PublicLegalPage>
  );
}
