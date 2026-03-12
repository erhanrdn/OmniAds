import type { Metadata } from "next";
import { PublicLegalPage } from "@/components/legal/PublicLegalPage";

export const metadata: Metadata = {
  title: "Security | Adsecute",
  description: "Security practices for Adsecute accounts, integrations, and data handling.",
};

export default function SecurityPage() {
  return (
    <PublicLegalPage
      title="Security"
      subtitle="Adsecute applies practical safeguards to protect account and integration data."
    >
      <section>
        <h2 className="text-xl font-semibold tracking-tight">Account and Integration Security</h2>
        <p className="mt-3">
          Adsecute uses authenticated access controls and integration authorization flows to ensure
          only approved users and connected services can access business data.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">Reasonable Safeguards</h2>
        <p className="mt-3">
          We use reasonable technical and organizational safeguards intended to reduce risk of
          unauthorized access, disclosure, or misuse of merchant data.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">Responsible Disclosure</h2>
        <p className="mt-3">
          If you believe you found a security issue, please report it to{" "}
          <a href="mailto:support@adsecute.com" className="underline underline-offset-2">
            support@adsecute.com
          </a>{" "}
          with relevant details so we can investigate promptly.
        </p>
      </section>
    </PublicLegalPage>
  );
}

