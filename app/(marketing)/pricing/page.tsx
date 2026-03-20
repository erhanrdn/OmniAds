import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ArrowRight, Minus } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing | Adsecute",
  description:
    "Simple, transparent pricing for Adsecute. Start free, upgrade as you grow. Starter, Growth, Pro, and Scale plans.",
};

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 0,
    description: "Overview dashboard, free forever.",
    cta: "Get started free",
    featured: false,
    limits: {
      history: "365-day history",
      workspaces: "1 workspace",
    },
    features: [
      { label: "Overview dashboard", included: true },
      { label: "AI daily insights", included: true },
      { label: "Creatives & copies", included: false },
      { label: "Meta & Google Ads", included: false },
      { label: "Analytics (GA4)", included: false },
      { label: "Landing pages", included: false },
      { label: "GEO & SEO intelligence", included: false },
      { label: "TikTok, Pinterest, Snapchat", included: false },
      { label: "Klaviyo", included: false },
      { label: "Custom reporting", included: false },
      { label: "Team roles", included: false },
      { label: "White-label reports", included: false },
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 49,
    description: "For brands scaling ad performance.",
    cta: "Start with Growth",
    featured: false,
    limits: {
      history: "365-day history",
      workspaces: "3 workspaces",
    },
    features: [
      { label: "Overview dashboard", included: true },
      { label: "AI daily insights", included: true },
      { label: "Creatives & copies", included: true },
      { label: "Meta & Google Ads", included: true },
      { label: "Analytics (GA4)", included: true },
      { label: "Landing pages", included: true },
      { label: "GEO & SEO intelligence", included: false },
      { label: "TikTok, Pinterest, Snapchat", included: false },
      { label: "Klaviyo", included: false },
      { label: "Custom reporting", included: false },
      { label: "Team roles", included: false },
      { label: "White-label reports", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 99,
    description: "For serious marketers and growing teams.",
    cta: "Start with Pro",
    featured: true,
    limits: {
      history: "Full history",
      workspaces: "5 workspaces",
    },
    features: [
      { label: "Overview dashboard", included: true },
      { label: "AI daily insights", included: true },
      { label: "Creatives & copies", included: true },
      { label: "Meta & Google Ads", included: true },
      { label: "Analytics (GA4)", included: true },
      { label: "Landing pages", included: true },
      { label: "GEO & SEO intelligence", included: true },
      { label: "TikTok, Pinterest, Snapchat", included: true },
      { label: "Klaviyo", included: true },
      { label: "Custom reporting", included: true },
      { label: "Team roles", included: false },
      { label: "White-label reports", included: false },
    ],
  },
  {
    id: "scale",
    name: "Scale",
    price: 249,
    description: "For agencies and multi-brand teams.",
    cta: "Start with Scale",
    featured: false,
    limits: {
      history: "Full history",
      workspaces: "Unlimited workspaces",
    },
    features: [
      { label: "Overview dashboard", included: true },
      { label: "AI daily insights", included: true },
      { label: "Creatives & copies", included: true },
      { label: "Meta & Google Ads", included: true },
      { label: "Analytics (GA4)", included: true },
      { label: "Landing pages", included: true },
      { label: "GEO & SEO intelligence", included: true },
      { label: "TikTok, Pinterest, Snapchat", included: true },
      { label: "Klaviyo", included: true },
      { label: "Custom reporting", included: true },
      { label: "Team roles", included: true },
      { label: "White-label reports", included: true },
    ],
  },
];

const FAQS = [
  {
    q: "Is the Starter plan really free?",
    a: "Yes. The Starter plan is free forever with no credit card required. You can connect 1 ad account, view 365 days of history, and access the Overview dashboard.",
  },
  {
    q: "What counts as an ad account?",
    a: "Each connected platform account counts separately. For example, 1 Meta Ads account + 1 Google Ads account = 2 ad accounts toward your plan limit.",
  },
  {
    q: "How does the Shopify billing integration work?",
    a: "Adsecute is billed directly through the Shopify App Store. Your subscription appears on your Shopify billing statement — no separate payment method required.",
  },
  {
    q: "Can I change plans at any time?",
    a: "Yes. You can upgrade or downgrade your plan at any time from your account settings. Changes take effect on your next billing cycle.",
  },
  {
    q: "What is the analytics history limit?",
    a: "Analytics history determines how far back Adsecute can pull data from your connected accounts. Starter and Growth include 365 days, and Pro/Scale includes full available history.",
  },
  {
    q: "Is there a free trial for paid plans?",
    a: "The Starter plan lets you explore the core platform for free. Paid plans begin when you upgrade — there is no time-limited trial on paid tiers.",
  },
];

export default function PricingPage() {
  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-background py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Start free and upgrade as your needs grow. Every plan includes the core platform —
            higher tiers unlock more accounts, history, and intelligence depth.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-xl border p-6 ${
                  plan.featured
                    ? "border-indigo-300 bg-indigo-50 shadow-md"
                    : "border-border bg-card"
                }`}
              >
                {plan.featured && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-medium text-white">
                      Most popular
                    </span>
                  </div>
                )}

                <div className="mb-5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {plan.name}
                  </p>
                  <div className="flex items-baseline gap-1 mb-2">
                    {plan.price === 0 ? (
                      <span className="text-3xl font-bold text-foreground">Free</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold text-foreground">${plan.price}</span>
                        <span className="text-sm text-muted-foreground">/month</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>

                {/* Limits */}
                <div className="rounded-lg bg-background border border-border p-3 mb-5 flex flex-col gap-1.5">
                  {Object.values(plan.limits).map((limit) => (
                    <div key={limit} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
                      {limit}
                    </div>
                  ))}
                </div>

                <Link
                  href="/login"
                  className={`inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors mb-6 ${
                    plan.featured
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-foreground text-background hover:opacity-90"
                  }`}
                >
                  {plan.cta}
                </Link>

                <div className="flex-1">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
                    Features
                  </p>
                  <ul className="flex flex-col gap-2">
                    {plan.features.map((feature) => (
                      <li
                        key={feature.label}
                        className={`flex items-center gap-2 text-xs ${
                          feature.included ? "text-foreground" : "text-muted-foreground/50"
                        }`}
                      >
                        {feature.included ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                        ) : (
                          <Minus className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                        )}
                        {feature.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-8">
            Billed through the Shopify App Store.{" "}
            <Link href="/contact" className="text-indigo-600 hover:underline">
              Questions? Contact us.
            </Link>
          </p>
        </div>
      </section>

      {/* Scale callout */}
      <section className="py-12 lg:py-16 bg-muted/20 border-y border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-12">
            <div className="flex-1">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-2">
                Scale plan
              </p>
              <h2 className="text-2xl font-bold text-foreground mb-3">
                For agencies and multi-brand teams.
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                The Scale plan includes everything in Pro plus agency mode, team member roles with
                access controls, white-label reporting, advanced data export, and priority support.
                Manage unlimited workspaces and stores from one account.
              </p>
            </div>
            <div className="shrink-0">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity"
              >
                Get started with Scale
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-foreground mb-10">Frequently asked questions</h2>
          <div className="flex flex-col gap-6">
            {FAQS.map((faq) => (
              <div key={faq.q} className="border-b border-border pb-6 last:border-0 last:pb-0">
                <p className="text-sm font-semibold text-foreground mb-2">{faq.q}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-20 bg-foreground">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-background mb-4">
            Start for free. No credit card required.
          </h2>
          <p className="text-base text-background/70 mb-8 max-w-lg mx-auto">
            The Starter plan gives you access to the core platform. Upgrade when you need more
            accounts, history, or intelligence.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-background px-6 py-3 text-sm font-medium text-foreground hover:bg-background/90 transition-colors"
          >
            Get started free
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
