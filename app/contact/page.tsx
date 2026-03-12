import type { Metadata } from "next";
import { PublicLegalPage } from "@/components/legal/PublicLegalPage";

export const metadata: Metadata = {
  title: "Contact | Adsecute",
  description: "Contact Adsecute support.",
};

export default function ContactPage() {
  return (
    <PublicLegalPage
      title="Contact & Support"
      subtitle="Need help with Adsecute, integrations, or account access? Contact our support team."
    >
      <section>
        <h2 className="text-xl font-semibold tracking-tight">Support Email</h2>
        <p className="mt-3">
          Email us at{" "}
          <a href="mailto:support@adsecute.com" className="underline underline-offset-2">
            support@adsecute.com
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">What to Include</h2>
        <p className="mt-3">
          For faster support, include your business name, a short description of the issue, and
          screenshots when relevant.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">Help Resources</h2>
        <p className="mt-3 text-muted-foreground">
          Help center and documentation links can be added here as they become available.
        </p>
      </section>
    </PublicLegalPage>
  );
}

