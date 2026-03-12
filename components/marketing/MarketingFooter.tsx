import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white text-sm font-bold select-none">
                A
              </div>
              <span className="text-sm font-semibold tracking-tight">Adsecute</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[200px]">
              AI advertising intelligence for Shopify brands.
            </p>
            <a
              href="mailto:support@adsecute.com"
              className="mt-4 inline-block text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              support@adsecute.com
            </a>
          </div>

          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">Product</p>
            <ul className="space-y-2.5">
              <li>
                <Link href="/product" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Overview
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/demo" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Demo
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">Company</p>
            <ul className="space-y-2.5">
              <li>
                <Link href="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">Legal</p>
            <ul className="space-y-2.5">
              <li>
                <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/security" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Security
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Adsecute. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
