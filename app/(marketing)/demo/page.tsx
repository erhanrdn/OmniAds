import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Layers,
  Globe2,
  Brain,
  Search,
  TrendingUp,
  ShoppingBag,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Demo | Adsecute",
  description:
    "Explore the Adsecute demo workspace. See real-looking dashboards, intelligence modules, and AI recommendations — no account required.",
};

const DEMO_MODULES = [
  {
    icon: BarChart3,
    name: "Overview dashboard",
    description:
      "Cross-platform KPIs — revenue, ROAS, spend, and purchases — with AI-generated insights surfaced daily.",
  },
  {
    icon: Layers,
    name: "Creative intelligence",
    description:
      "Ranked creatives by ROAS, CTR, and hook rate. Side-by-side comparisons with AI performance tags.",
  },
  {
    icon: Brain,
    name: "Copy intelligence",
    description:
      "Ad copy performance scored by conversion metrics. Messaging angle analysis and iteration recommendations.",
  },
  {
    icon: Search,
    name: "Google Ads",
    description:
      "Search term intelligence, keyword performance, device breakdowns, and budget optimization signals.",
  },
  {
    icon: Globe2,
    name: "GEO intelligence",
    description:
      "Geographic performance by region with organic intent mapping and expansion opportunity scoring.",
  },
  {
    icon: TrendingUp,
    name: "Analytics",
    description:
      "Google Analytics 4 audience data, cohort retention, product funnel, and landing page performance.",
  },
];

export default function DemoPage() {
  return (
    <div>
      {/* Hero */}
      <section className="border-b border-border bg-background py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 mb-6">
              <Zap className="h-3.5 w-3.5" />
              Live demo workspace
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-[1.1] mb-6">
              See Adsecute with real-looking data.
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              The Adsecute demo workspace is loaded with realistic ecommerce data from UrbanTrail
              — a Shopify brand selling outdoor backpacks and travel gear. Every module, every
              insight, every AI recommendation is populated and ready to explore.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity"
              >
                Explore the demo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Create your account
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Log in and select the Adsecute Demo workspace to start exploring.
            </p>
          </div>
        </div>
      </section>

      {/* Demo workspace overview */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center mb-16">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-4">
                The UrbanTrail demo brand
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed mb-5">
                UrbanTrail is a realistic Shopify brand seeded into the Adsecute demo workspace.
                The data represents a performance-driven ecommerce brand running ads across Meta
                and Google, with an active Shopify store and GA4 tracking in place.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mb-6">
                The demo is designed to show Adsecute at its most useful — with enough data to
                surface real AI insights, real opportunity flags, and real cross-platform comparisons.
              </p>
              <ul className="flex flex-col gap-3">
                {[
                  "Active Meta and Google Ads campaigns",
                  "Shopify revenue and purchase data connected",
                  "Google Analytics 4 audience and funnel data",
                  "AI recommendations populated with real signal",
                  "GEO intelligence with regional breakdowns",
                  "Creative and copy performance ranked",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <div className="h-4 w-4 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Demo brand card */}
            <div className="mt-10 lg:mt-0 rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-3 pb-4 mb-4 border-b border-border">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-bold text-lg">
                  U
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">UrbanTrail</p>
                  <p className="text-xs text-muted-foreground">Adsecute Demo Workspace</p>
                </div>
                <div className="ml-auto">
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Demo active
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: "Monthly revenue", value: "$84,320" },
                  { label: "ROAS (blended)", value: "4.2x" },
                  { label: "Monthly spend", value: "$20,076" },
                  { label: "Purchases", value: "1,204" },
                ].map((kpi) => (
                  <div key={kpi.label} className="rounded-lg border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
                    <p className="text-base font-semibold text-foreground">{kpi.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 mb-3">
                <div className="flex items-start gap-2">
                  <Zap className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-indigo-800">AI insight</p>
                    <p className="text-xs text-indigo-700 mt-0.5 leading-relaxed">
                      Top creative has 5.1x ROAS on $3,200 spend. Recommend 40% budget increase
                      to scale before audience saturation.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 border border-border p-3">
                <div className="flex items-start gap-2">
                  <Globe2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">GEO opportunity</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Pacific Northwest shows high organic intent with low paid competition.
                      Estimated CPA: $14. Currently uncovered.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* What you can explore */}
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-8">What you can explore</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {DEMO_MODULES.map((mod) => {
                const Icon = mod.icon;
                return (
                  <div
                    key={mod.name}
                    className="rounded-xl border border-border bg-card p-5 hover:border-indigo-200 hover:shadow-sm transition-all"
                  >
                    <div className="mb-3 inline-flex items-center justify-center rounded-lg bg-indigo-50 p-2">
                      <Icon className="h-4.5 w-4.5 text-indigo-600" />
                    </div>
                    <p className="text-sm font-semibold text-foreground mb-1.5">{mod.name}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{mod.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* How to access */}
      <section className="py-16 lg:py-20 bg-muted/20 border-y border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-foreground mb-3">How to access the demo</h2>
            <p className="text-base text-muted-foreground max-w-xl mx-auto">
              The demo workspace is available to all Adsecute users. Log in or create a free
              account, then select the Adsecute Demo workspace from the workspace selector.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              {
                step: "1",
                title: "Create an account",
                desc: "Sign up for free. No credit card required. Takes about 30 seconds.",
              },
              {
                step: "2",
                title: "Select the demo workspace",
                desc: "After login, select the Adsecute Demo workspace from the top workspace selector.",
              },
              {
                step: "3",
                title: "Explore freely",
                desc: "Browse every module. All data is pre-loaded and all AI insights are populated.",
              },
            ].map((step) => (
              <div key={step.step} className="text-center">
                <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background text-sm font-bold">
                  {step.step}
                </div>
                <p className="text-sm font-semibold text-foreground mb-1.5">{step.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity"
            >
              Get started free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            Ready to connect your own accounts?
          </h2>
          <p className="text-base text-muted-foreground max-w-lg mx-auto mb-8">
            After exploring the demo, connect your Meta, Google, and Shopify accounts to see
            your own data in the same intelligence platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity"
            >
              Start free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
