import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  Brain,
  Globe2,
  Search,
  Layers,
  TrendingUp,
  ShoppingBag,
  CheckCircle2,
  ArrowRight,
  Zap,
  Database,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Product | Adsecute",
  description:
    "Explore Adsecute's intelligence modules: cross-platform analytics, creative intelligence, copy analysis, Google Ads, GEO intelligence, and Shopify revenue tracking.",
};

const MODULES = [
  {
    icon: BarChart3,
    name: "Overview",
    tagline: "Your full advertising picture, at a glance.",
    description:
      "The Adsecute overview brings together spend, revenue, ROAS, purchases, and CPA from every connected platform. See what changed, what's trending, and where your attention is needed — without digging through separate dashboards.",
    capabilities: [
      "Cross-platform KPI summary (Meta, Google, TikTok, Pinterest, Snapchat)",
      "Revenue and ROAS tracking connected to Shopify",
      "AI-generated daily insights and anomaly detection",
      "Platform efficiency comparison table",
      "Opportunity panel with ranked action items",
    ],
  },
  {
    icon: Layers,
    name: "Creatives",
    tagline: "Know which visuals drive results before you scale.",
    description:
      "Creative intelligence goes beyond impressions and CTR. Adsecute analyzes creative performance across hook rate, engagement, conversion metrics, and spend efficiency — giving you a ranked view of what's working and why.",
    capabilities: [
      "Creative scoring by ROAS, CTR, CPA, and hook rate",
      "Side-by-side creative comparison",
      "Performance breakdown by ad format (video, static, carousel)",
      "AI-tagged creative themes and patterns",
      "Shareable creative performance reports",
    ],
  },
  {
    icon: Brain,
    name: "Copies",
    tagline: "Understand what messaging actually converts.",
    description:
      "Ad copy is often an afterthought. Adsecute makes it a data point. Analyze headline and body text performance, identify winning messaging angles, and see which copy attributes correlate with higher conversion rates.",
    capabilities: [
      "Copy performance scored by CTR, CVR, and ROAS",
      "Headline vs body text analysis",
      "Messaging angle classification (urgency, social proof, benefit-led)",
      "Top performing copy patterns per audience segment",
      "Copy iteration recommendations",
    ],
  },
  {
    icon: Search,
    name: "Google Ads",
    tagline: "Deep search intelligence, not just campaign stats.",
    description:
      "Go beyond the Google Ads interface. Adsecute surfaces search term intelligence, keyword performance, device and geographic breakdowns, budget allocation signals, and creative performance for search and display.",
    capabilities: [
      "Search term performance with intent classification",
      "Keyword efficiency: ROAS, CPA, impression share",
      "Campaign and ad group breakdown",
      "Device performance comparison",
      "Budget and opportunity recommendations",
      "Search Console integration for organic vs paid gap analysis",
    ],
  },
  {
    icon: Globe2,
    name: "GEO Intelligence",
    tagline: "Find where your next customers are.",
    description:
      "Geographic signals are underused in most ad strategies. Adsecute combines paid performance data, organic search intent, and Shopify revenue by region to surface where to invest — and where you're over-spending.",
    capabilities: [
      "Regional ROAS, spend, and revenue breakdown",
      "Organic search intent mapping by geography",
      "Expansion opportunity scoring",
      "GEO-level ad performance vs organic overlap analysis",
      "City and region level granularity",
    ],
  },
  {
    icon: TrendingUp,
    name: "Analytics",
    tagline: "Full Google Analytics 4 intelligence in context.",
    description:
      "Connect GA4 to see audience behavior, cohort retention, product funnel data, and landing page performance — all alongside your paid channel data so you understand the full picture from click to conversion.",
    capabilities: [
      "Audience overview and demographics",
      "Cohort retention analysis",
      "Product funnel and purchase path",
      "Landing page performance with engagement metrics",
      "Organic vs paid traffic comparison",
    ],
  },
];

const INTEGRATIONS = [
  { name: "Meta Ads", description: "Campaigns, creatives, audiences, and attribution" },
  { name: "Google Ads", description: "Search, display, shopping, performance max" },
  { name: "TikTok Ads", description: "Campaign and ad performance metrics" },
  { name: "Pinterest Ads", description: "Pin and campaign analytics" },
  { name: "Snapchat Ads", description: "Campaign and story ad metrics" },
  { name: "Shopify", description: "Revenue, orders, products, and conversion data" },
  { name: "Google Analytics 4", description: "Audience, behavior, and funnel data" },
  { name: "Google Search Console", description: "Organic search performance and queries" },
];

export default function ProductPage() {
  return (
    <div>
      {/* Hero */}
      <section className="border-b border-border bg-background py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 mb-6">
              <Zap className="h-3.5 w-3.5" />
              Platform overview
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-[1.1] mb-6">
              A complete intelligence platform for Shopify advertisers.
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              Adsecute connects every ad channel, your Shopify store, and Google Analytics into
              one platform — then adds an AI layer that tells you what to do next.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity"
              >
                Get started free
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
        </div>
      </section>

      {/* Modules */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-3">
              Intelligence modules
            </h2>
            <p className="text-base text-muted-foreground max-w-2xl">
              Each module is built to answer a specific question your ad team faces. Together,
              they give you coverage across every layer of your marketing stack.
            </p>
          </div>

          <div className="flex flex-col gap-14">
            {MODULES.map((mod, i) => {
              const Icon = mod.icon;
              return (
                <div
                  key={mod.name}
                  className={`flex flex-col ${
                    i % 2 !== 0 ? "lg:flex-row-reverse" : "lg:flex-row"
                  } items-start gap-8 lg:gap-16 pb-14 border-b border-border last:border-0 last:pb-0`}
                >
                  <div className="flex-1">
                    <div className="inline-flex items-center justify-center rounded-lg bg-indigo-50 p-2.5 mb-4">
                      <Icon className="h-5 w-5 text-indigo-600" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-1">{mod.name}</h3>
                    <p className="text-sm font-medium text-indigo-600 mb-3">{mod.tagline}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                      {mod.description}
                    </p>
                    <ul className="flex flex-col gap-2">
                      {mod.capabilities.map((cap) => (
                        <li key={cap} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
                          {cap}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex-1 w-full rounded-xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-indigo-500" />
                        <span className="text-sm font-medium text-foreground">{mod.name}</span>
                      </div>
                      <div className="flex gap-2">
                        <div className="h-6 w-16 rounded bg-muted" />
                        <div className="h-6 w-10 rounded bg-muted" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {[0, 1, 2, 3].map((j) => (
                        <div key={j} className="rounded-lg border border-border bg-background p-3">
                          <div className="h-2.5 w-12 rounded bg-muted mb-2" />
                          <div className="h-5 w-16 rounded bg-foreground/15 mb-1.5" />
                          <div className="h-1.5 w-8 rounded-full bg-green-300/60" />
                        </div>
                      ))}
                    </div>

                    <div className="rounded-lg border border-border bg-background p-3">
                      <div className="h-2.5 w-20 rounded bg-muted mb-3" />
                      <div className="flex items-end gap-1.5 h-16">
                        {[60, 40, 75, 50, 85, 65, 90, 70, 80, 55, 95, 72].map((h, k) => (
                          <div
                            key={k}
                            className={`flex-1 rounded-sm ${k % 3 === 0 ? "bg-indigo-400/70" : "bg-indigo-200/50"}`}
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-20 lg:py-28 bg-muted/20 border-y border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center rounded-lg bg-indigo-50 p-2.5 mb-4">
              <Database className="h-5 w-5 text-indigo-600" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-3">
              Connects to your stack
            </h2>
            <p className="text-base text-muted-foreground max-w-xl mx-auto">
              Adsecute connects to the tools you already use. Set up integrations in minutes with
              OAuth — no API keys or developer work required.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {INTEGRATIONS.map((integration) => (
              <div
                key={integration.name}
                className="rounded-xl border border-border bg-card p-5 hover:border-indigo-200 hover:shadow-sm transition-all"
              >
                <p className="text-sm font-semibold text-foreground mb-1">{integration.name}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {integration.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground mb-4">
            Ready to see it in action?
          </h2>
          <p className="text-base text-muted-foreground max-w-xl mx-auto mb-8">
            Start free with the Starter plan, or explore the demo workspace to see real data
            before connecting your accounts.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity"
            >
              Get started free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Explore the demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
