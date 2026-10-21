"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { AppMark } from "@/components/boxoffice/app-mark";
import { APP_NAME, APP_TAGLINE } from "@/lib/boxoffice/brand";
import { AssistantConsole } from "@/components/assistant-console";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { BackToTop } from "@/components/back-to-top";
import { JobsProvider } from "@/components/jobs/job-store";
import { PipelineProvider } from "@/components/pipeline/pipeline-provider";
import { ApplyProvider } from "@/components/apply/apply-provider";
import { ExploreProvider } from "@/components/explore/explore-provider";
import { FirstScoreView } from "@/components/explore/first-score-view";
import { WorkerPills } from "@/components/jobs/worker-pills";
import { UsageMeter } from "@/components/usage-meter";
import { HeroGlow } from "@/components/hero-glow";
import { visibleNavItems, isActivePath } from "@/lib/nav-items";

export function AppShell({ children, followupsEnabled }: { children: React.ReactNode; followupsEnabled: boolean }) {
  const pathname = usePathname();
  return (
    <JobsProvider>
      <PipelineProvider>
      <ApplyProvider>
      <ExploreProvider>
      <div aria-hidden className="bo-drag-strip" />
      {/* The glow sits behind the whole window so the glass layers (sidebar,
          toolbars, the Today card) have something to refract. */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[680px] [mask-image:linear-gradient(to_bottom,black_45%,transparent)]">
        <HeroGlow />
        {/* The same soft frosting the original Today card used, so the grain
            reads as a glow wherever there's no glass over it. */}
        <div className="absolute inset-0 z-[1] bg-background/50 backdrop-blur-[3px]" />
      </div>
      <MobileNav followupsEnabled={followupsEnabled} />
      <div className="relative z-10 flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 p-2.5 md:flex">
          <div className="bo-sidebar-card glass flex w-full flex-col overflow-y-auto rounded-[18px] p-2.5">
          <Link href="/" className="mb-6 flex items-center gap-2.5 px-2 py-1">
            <AppMark size={28} />
            <span className="flex min-w-0 flex-col">
              <span className="text-[13px] font-semibold leading-tight text-foreground">{APP_NAME}</span>
              <span className="text-[11px] leading-tight text-muted">{APP_TAGLINE}</span>
            </span>
          </Link>
          <nav className="flex flex-col gap-0.5">
            {visibleNavItems(followupsEnabled).map(({ href, label, icon: Icon, chip }) => {
              const active = isActivePath(href, pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex min-h-[32px] items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] transition-colors",
                    active
                      ? "glass-selected font-medium text-foreground"
                      : "glass-hover text-foreground/85",
                  )}
                >
                  <Icon className={cn("size-4", active ? "text-brand-text" : "text-muted")} />
                  {label}
                  {chip && (
                    <span className="ml-auto rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand-text">
                      {chip}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <WorkerPills />

          <div className="mt-auto space-y-3 pb-16 pt-4">
            <UsageMeter />
            <div className="space-y-1.5">
              <div className="px-1">
                <span className="text-[11px] font-semibold text-muted">Appearance</span>
              </div>
              <ThemeToggle showLabel />
              <div className="px-1">
                <span className="text-[11px] text-faint">Runs on this Mac</span>
              </div>
            </div>
          </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
        <AssistantConsole />
        <BackToTop />
        <FirstScoreView />
      </div>
      </ExploreProvider>
      </ApplyProvider>
      </PipelineProvider>
    </JobsProvider>
  );
}
