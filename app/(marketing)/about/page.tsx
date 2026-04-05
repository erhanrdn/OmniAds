import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us | Adsecute",
  description:
    "Learn about the team behind Adsecute — built by e-commerce operators who managed millions in ad spend and never found a tool that did everything they needed.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
      <header className="mb-12">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          About Us
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Built by operators, for operators.
        </h1>
        <p className="mt-4 text-base text-muted-foreground leading-relaxed">
          Adsecute was born out of nine years of frustration — and nine years of hard-won knowledge.
        </p>
      </header>

      <article className="space-y-8 text-sm leading-7 sm:text-base text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">The Story</h2>
          <p className="mt-3">
            Before Adsecute existed, our founder spent nearly a decade managing Meta advertising
            campaigns for e-commerce businesses — both as a consultant and as an operator running
            his own commercial ventures. Over that time, he worked across dozens of stores,
            managed meaningful ad budgets, and developed a deep, practical understanding of what
            it actually takes to grow an e-commerce brand through paid advertising.
          </p>
          <p className="mt-4">
            Nine out of ten of those businesses ran on Shopify. Not because it was the only option,
            but because for direct-to-consumer brands serious about scaling, Shopify became the
            de facto foundation. That familiarity with the Shopify ecosystem shaped how he thought
            about data, attribution, and the connection between ad performance and store revenue.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">The Problem</h2>
          <p className="mt-3">
            Throughout that time, he tried every major ad management and analytics platform
            available. Some were strong on reporting but weak on actionability. Others were
            powerful for agencies but poorly suited to operators who needed to move fast. A few
            tried to do everything and ended up doing nothing well.
          </p>
          <p className="mt-4">
            The gap was always the same: no tool truly connected creative performance, audience
            behavior, campaign structure, and store-level outcomes in a single place — and
            surfaced that information in a way that was actually useful for making decisions.
            The data existed. The intelligence didn&apos;t.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Why We Built Adsecute</h2>
          <p className="mt-3">
            Adsecute was built to be the tool that was always missing. It&apos;s designed for
            e-commerce teams — whether in-house or independent — who manage Meta and Google Ads
            alongside a Shopify store and need a single, intelligent layer that connects all of
            it. Not a dashboard that replicates what&apos;s already in the ad platforms, but a
            genuine intelligence layer that helps you understand what&apos;s working, what
            isn&apos;t, and what to do about it.
          </p>
          <p className="mt-4">
            Every feature in Adsecute reflects a real decision someone had to make at 11pm before
            a campaign deadline. Every metric was chosen because it&apos;s actually relevant to
            how e-commerce advertising works in practice — not because it looked good in a
            product demo.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">What We Do</h2>
          <p className="mt-3">
            Adsecute provides advertising intelligence and campaign management support for
            e-commerce businesses. Our platform connects to Meta Ads, Google Ads, Shopify,
            and other marketing tools to provide unified performance reporting, creative analysis,
            audience insights, and AI-powered optimization recommendations.
          </p>
          <p className="mt-4">
            We use the Meta Marketing API and Google Ads API to retrieve campaign, ad set,
            ad, and keyword performance data — enabling dashboards, alerting, reporting, and
            decision-support tools that help operators manage their advertising more effectively.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Contact & Company</h2>
          <p className="mt-3">
            Adsecute is incorporated in the state of Delaware, United States.
          </p>
          <address className="mt-3 not-italic text-sm text-muted-foreground leading-6">
            Adsecute<br />
            8 The Green<br />
            Dover, DE 19901<br />
            United States
          </address>
          <p className="mt-4">
            For questions, support, or partnership inquiries, reach us at{" "}
            <a
              href="mailto:support@adsecute.com"
              className="text-foreground underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              support@adsecute.com
            </a>
            .
          </p>
        </section>
      </article>
    </div>
  );
}
