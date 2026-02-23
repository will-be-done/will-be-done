import { format, startOfWeek, addDays, subWeeks } from "date-fns";
import { generateNKeysBetween } from "fractional-indexing-jittered";
import { Backup } from "@will-be-done/slices/space";

const dmy = (date: Date) => format(date, "yyyy-MM-dd");

// 60 evenly-spaced fractional-index keys — enough for all orderings.
const K = generateNKeysBetween(null, null, 60);

export function generateDemoBackup(): Backup {
  const base = Date.now();
  const t = (offsetMs: number) => base - offsetMs;

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  const days = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(weekStart, n));
  const prevWeekStart = subWeeks(weekStart, 1);
  const prevWeekDays = [0, 1, 2, 3, 4, 5, 6].map((n) =>
    addDays(prevWeekStart, n),
  );

  // ── Projects ────────────────────────────────────────────────────────────────
  const projects = [
    { id: "p-inbox",     title: "Inbox",               icon: "📥", isInbox: true,  orderToken: K[0],  createdAt: t(9_000_000) },
    { id: "p-product",   title: "Product Development", icon: "💻", isInbox: false, orderToken: K[1],  createdAt: t(8_900_000) },
    { id: "p-design",    title: "Design System",       icon: "🎨", isInbox: false, orderToken: K[2],  createdAt: t(8_800_000) },
    { id: "p-marketing", title: "Marketing",           icon: "📢", isInbox: false, orderToken: K[3],  createdAt: t(8_700_000) },
    { id: "p-infra",     title: "Infrastructure",      icon: "⚙️",  isInbox: false, orderToken: K[4],  createdAt: t(8_600_000) },
    { id: "p-success",   title: "Customer Success",    icon: "🤝", isInbox: false, orderToken: K[5],  createdAt: t(8_500_000) },
    { id: "p-growth",    title: "Personal Growth",     icon: "🌱", isInbox: false, orderToken: K[6],  createdAt: t(8_400_000) },
    { id: "p-health",    title: "Health & Fitness",    icon: "💪", isInbox: false, orderToken: K[7],  createdAt: t(8_300_000) },
    { id: "p-side",      title: "Side Project",        icon: "🚀", isInbox: false, orderToken: K[8],  createdAt: t(8_200_000) },
    { id: "p-finance",   title: "Finance",             icon: "💰", isInbox: false, orderToken: K[9],  createdAt: t(8_100_000) },
    { id: "p-legal",     title: "Legal & Compliance",  icon: "⚖️",  isInbox: false, orderToken: K[10], createdAt: t(8_000_000) },
    { id: "p-rd",        title: "Research & Dev",       icon: "🔬", isInbox: false, orderToken: K[11], createdAt: t(7_900_000) },
    { id: "p-hr",        title: "People & HR",          icon: "👥", isInbox: false, orderToken: K[12], createdAt: t(7_800_000) },
    { id: "p-sales",     title: "Sales",                icon: "💼", isInbox: false, orderToken: K[13], createdAt: t(7_700_000) },
    { id: "p-data",      title: "Data & Analytics",     icon: "📊", isInbox: false, orderToken: K[14], createdAt: t(7_600_000) },
    { id: "p-security",  title: "Security",             icon: "🛡️",  isInbox: false, orderToken: K[15], createdAt: t(7_500_000) },
    { id: "p-community", title: "Community",            icon: "🌐", isInbox: false, orderToken: K[16], createdAt: t(7_400_000) },
    { id: "p-events",    title: "Events",               icon: "🎤", isInbox: false, orderToken: K[17], createdAt: t(7_300_000) },
    { id: "p-partners",  title: "Partnerships",         icon: "🔗", isInbox: false, orderToken: K[18], createdAt: t(7_200_000) },
    { id: "p-strategy",  title: "Product Strategy",     icon: "🗺️",  isInbox: false, orderToken: K[19], createdAt: t(7_100_000) },
  ];

  // ── Categories ──────────────────────────────────────────────────────────────
  // orderToken only needs to be unique within a project; reuse K[0]/K[1]/K[2].
  const projectCategories = [
    { id: "c-inbox",       title: "Miscellaneous",  projectId: "p-inbox",     orderToken: K[0], createdAt: t(7_000_000) },
    { id: "c-prod-be",     title: "Backend",        projectId: "p-product",   orderToken: K[0], createdAt: t(6_990_000) },
    { id: "c-prod-fe",     title: "Frontend",       projectId: "p-product",   orderToken: K[1], createdAt: t(6_980_000) },
    { id: "c-prod-mobile", title: "Mobile",         projectId: "p-product",   orderToken: K[2], createdAt: t(6_970_000) },
    { id: "c-design-comp", title: "Components",     projectId: "p-design",    orderToken: K[0], createdAt: t(6_960_000) },
    { id: "c-design-tok",  title: "Design Tokens",  projectId: "p-design",    orderToken: K[1], createdAt: t(6_950_000) },
    { id: "c-mkt-content", title: "Content",        projectId: "p-marketing", orderToken: K[0], createdAt: t(6_940_000) },
    { id: "c-mkt-seo",     title: "SEO",            projectId: "p-marketing", orderToken: K[1], createdAt: t(6_930_000) },
    { id: "c-infra-ci",    title: "CI/CD",          projectId: "p-infra",     orderToken: K[0], createdAt: t(6_920_000) },
    { id: "c-infra-cloud", title: "Cloud",          projectId: "p-infra",     orderToken: K[1], createdAt: t(6_910_000) },
    { id: "c-cs-support",  title: "Support",        projectId: "p-success",   orderToken: K[0], createdAt: t(6_900_000) },
    { id: "c-cs-docs",     title: "Documentation",  projectId: "p-success",   orderToken: K[1], createdAt: t(6_890_000) },
    { id: "c-gr-books",    title: "Reading",        projectId: "p-growth",    orderToken: K[0], createdAt: t(6_880_000) },
    { id: "c-gr-courses",  title: "Courses",        projectId: "p-growth",    orderToken: K[1], createdAt: t(6_870_000) },
    { id: "c-h-workout",   title: "Workout",        projectId: "p-health",    orderToken: K[0], createdAt: t(6_860_000) },
    { id: "c-h-nutrition", title: "Nutrition",      projectId: "p-health",    orderToken: K[1], createdAt: t(6_850_000) },
    { id: "c-side-mvp",    title: "MVP",            projectId: "p-side",      orderToken: K[0], createdAt: t(6_840_000) },
    { id: "c-side-launch", title: "Launch",         projectId: "p-side",      orderToken: K[1], createdAt: t(6_830_000) },
    { id: "c-fin-budget",  title: "Budget",         projectId: "p-finance",   orderToken: K[0], createdAt: t(6_820_000) },
    { id: "c-fin-invest",  title: "Investments",    projectId: "p-finance",   orderToken: K[1], createdAt: t(6_810_000) },
    { id: "c-lc-contracts",title: "Contracts",      projectId: "p-legal",     orderToken: K[0], createdAt: t(6_800_000) },
    { id: "c-lc-comp",     title: "Compliance",     projectId: "p-legal",     orderToken: K[1], createdAt: t(6_790_000) },
    { id: "c-rd-research", title: "Research",       projectId: "p-rd",        orderToken: K[0], createdAt: t(6_780_000) },
    { id: "c-rd-exp",      title: "Experiments",    projectId: "p-rd",        orderToken: K[1], createdAt: t(6_770_000) },
    { id: "c-hr-hiring",   title: "Hiring",         projectId: "p-hr",        orderToken: K[0], createdAt: t(6_760_000) },
    { id: "c-hr-culture",  title: "Culture",        projectId: "p-hr",        orderToken: K[1], createdAt: t(6_750_000) },
    { id: "c-sa-pipeline", title: "Pipeline",       projectId: "p-sales",     orderToken: K[0], createdAt: t(6_740_000) },
    { id: "c-sa-outreach", title: "Outreach",       projectId: "p-sales",     orderToken: K[1], createdAt: t(6_730_000) },
    { id: "c-da-dash",     title: "Dashboards",     projectId: "p-data",      orderToken: K[0], createdAt: t(6_720_000) },
    { id: "c-da-quality",  title: "Data Quality",   projectId: "p-data",      orderToken: K[1], createdAt: t(6_710_000) },
    { id: "c-sec-vuln",    title: "Vulnerabilities",projectId: "p-security",  orderToken: K[0], createdAt: t(6_700_000) },
    { id: "c-sec-policy",  title: "Policies",       projectId: "p-security",  orderToken: K[1], createdAt: t(6_690_000) },
    { id: "c-comm-social", title: "Social",         projectId: "p-community", orderToken: K[0], createdAt: t(6_680_000) },
    { id: "c-comm-engage", title: "Engagement",     projectId: "p-community", orderToken: K[1], createdAt: t(6_670_000) },
    { id: "c-ev-sponsor",  title: "Sponsorships",   projectId: "p-events",    orderToken: K[0], createdAt: t(6_660_000) },
    { id: "c-ev-speak",    title: "Speaking",       projectId: "p-events",    orderToken: K[1], createdAt: t(6_650_000) },
    { id: "c-pa-bd",       title: "Business Dev",   projectId: "p-partners",  orderToken: K[0], createdAt: t(6_640_000) },
    { id: "c-pa-int",      title: "Integrations",   projectId: "p-partners",  orderToken: K[1], createdAt: t(6_630_000) },
    { id: "c-st-roadmap",  title: "Roadmap",        projectId: "p-strategy",  orderToken: K[0], createdAt: t(6_620_000) },
    { id: "c-st-research", title: "Research",       projectId: "p-strategy",  orderToken: K[1], createdAt: t(6_610_000) },
  ];

  // ── Tasks ────────────────────────────────────────────────────────────────────
  // Each projected task must appear on at most ONE daily list (projection.id = taskId).
  const tasks = [
    // Inbox
    { id: "tk-inbox-1",   title: "Follow up with Alex about Q2 budget",                catId: "c-inbox",       done: false, horizon: "week"    as const },
    { id: "tk-inbox-2",   title: "Schedule team retrospective",                         catId: "c-inbox",       done: false, horizon: "week"    as const },
    { id: "tk-inbox-3",   title: "Reply to legal team about contract",                  catId: "c-inbox",       done: false, horizon: "someday" as const },

    // Product – Backend
    { id: "tk-be-1",      title: "Implement JWT refresh token rotation",                catId: "c-prod-be",     done: false, horizon: "week"    as const },
    { id: "tk-be-2",      title: "Optimise slow database queries",                      catId: "c-prod-be",     done: true,  horizon: "week"    as const },
    { id: "tk-be-3",      title: "Add rate limiting to public API",                     catId: "c-prod-be",     done: false, horizon: "week"    as const },
    { id: "tk-be-4",      title: "Write migration for user preferences table",          catId: "c-prod-be",     done: false, horizon: "month"   as const },

    // Product – Frontend
    { id: "tk-fe-1",      title: "Fix keyboard navigation in task list",                catId: "c-prod-fe",     done: false, horizon: "week"    as const },
    { id: "tk-fe-2",      title: "Add empty-state illustration to projects page",       catId: "c-prod-fe",     done: true,  horizon: "week"    as const },
    { id: "tk-fe-3",      title: "Implement drag-and-drop reorder for tasks",          catId: "c-prod-fe",     done: false, horizon: "week"    as const },
    { id: "tk-fe-4",      title: "Reduce initial bundle size",                          catId: "c-prod-fe",     done: false, horizon: "month"   as const },

    // Product – Mobile
    { id: "tk-mob-1",     title: "Investigate crash on iOS 17.4",                       catId: "c-prod-mobile", done: false, horizon: "week"    as const },
    { id: "tk-mob-2",     title: "Push notification deep-link handling",                catId: "c-prod-mobile", done: false, horizon: "month"   as const },

    // Design – Components
    { id: "tk-dc-1",      title: "Build reusable Button component variants",            catId: "c-design-comp", done: true,  horizon: "week"    as const },
    { id: "tk-dc-2",      title: "Document Modal component usage",                      catId: "c-design-comp", done: false, horizon: "week"    as const },
    { id: "tk-dc-3",      title: "Create Badge and Tag components",                     catId: "c-design-comp", done: false, horizon: "week"    as const },
    { id: "tk-dc-4",      title: "Audit accessibility on form inputs",                  catId: "c-design-comp", done: false, horizon: "month"   as const },

    // Design – Tokens
    { id: "tk-dt-1",      title: "Finalise dark-mode colour tokens",                    catId: "c-design-tok",  done: false, horizon: "week"    as const },
    { id: "tk-dt-2",      title: "Export tokens to CSS variables",                      catId: "c-design-tok",  done: true,  horizon: "week"    as const },

    // Marketing – Content
    { id: "tk-mc-1",      title: "Write blog post: \"5 ways to beat procrastination\"", catId: "c-mkt-content", done: false, horizon: "week"    as const },
    { id: "tk-mc-2",      title: "Record product demo video",                           catId: "c-mkt-content", done: false, horizon: "week"    as const },
    { id: "tk-mc-3",      title: "Prepare Q2 newsletter",                               catId: "c-mkt-content", done: false, horizon: "month"   as const },

    // Marketing – SEO
    { id: "tk-seo-1",     title: "Audit meta descriptions on landing pages",            catId: "c-mkt-seo",     done: false, horizon: "week"    as const },
    { id: "tk-seo-2",     title: "Add structured data to blog posts",                   catId: "c-mkt-seo",     done: false, horizon: "month"   as const },

    // Infrastructure – CI/CD
    { id: "tk-ci-1",      title: "Speed up CI pipeline — cache node_modules",          catId: "c-infra-ci",    done: false, horizon: "week"    as const },
    { id: "tk-ci-2",      title: "Add smoke tests to deployment workflow",              catId: "c-infra-ci",    done: true,  horizon: "week"    as const },

    // Infrastructure – Cloud
    { id: "tk-cloud-1",   title: "Set up staging environment on Fly.io",               catId: "c-infra-cloud", done: false, horizon: "week"    as const },
    { id: "tk-cloud-2",   title: "Configure automated database backups",               catId: "c-infra-cloud", done: false, horizon: "month"   as const },

    // Customer Success – Support
    { id: "tk-cs-1",      title: "Respond to priority support tickets",                 catId: "c-cs-support",  done: false, horizon: "week"    as const },
    { id: "tk-cs-2",      title: "Compile top 10 feature requests from users",          catId: "c-cs-support",  done: false, horizon: "week"    as const },

    // Customer Success – Docs
    { id: "tk-cd-1",      title: "Update sync troubleshooting guide",                   catId: "c-cs-docs",     done: false, horizon: "week"    as const },
    { id: "tk-cd-2",      title: "Write getting-started tutorial",                      catId: "c-cs-docs",     done: false, horizon: "month"   as const },

    // Growth – Reading
    { id: "tk-gr-1",      title: "Read \"Shape Up\" chapters 4–6",                     catId: "c-gr-books",    done: true,  horizon: "week"    as const },
    { id: "tk-gr-2",      title: "Summarise \"The Phoenix Project\" notes",             catId: "c-gr-books",    done: false, horizon: "month"   as const },

    // Growth – Courses
    { id: "tk-gc-1",      title: "Complete TypeScript advanced generics module",        catId: "c-gr-courses",  done: false, horizon: "week"    as const },
    { id: "tk-gc-2",      title: "Watch database indexing lecture",                     catId: "c-gr-courses",  done: false, horizon: "week"    as const },

    // Health – Workout
    { id: "tk-hw-1",      title: "Morning run — 5 km",                                  catId: "c-h-workout",   done: true,  horizon: "week"    as const },
    { id: "tk-hw-2",      title: "Strength training — upper body",                      catId: "c-h-workout",   done: false, horizon: "week"    as const },
    { id: "tk-hw-3",      title: "Evening yoga session",                                catId: "c-h-workout",   done: false, horizon: "week"    as const },

    // Health – Nutrition
    { id: "tk-hn-1",      title: "Meal prep for the week",                              catId: "c-h-nutrition", done: false, horizon: "week"    as const },
    { id: "tk-hn-2",      title: "Order weekly groceries",                              catId: "c-h-nutrition", done: true,  horizon: "week"    as const },

    // Side Project – MVP
    { id: "tk-sm-1",      title: "Implement user onboarding flow",                      catId: "c-side-mvp",    done: false, horizon: "week"    as const },
    { id: "tk-sm-2",      title: "Set up error monitoring with Sentry",                 catId: "c-side-mvp",    done: true,  horizon: "week"    as const },
    { id: "tk-sm-3",      title: "Add Stripe billing integration",                      catId: "c-side-mvp",    done: false, horizon: "month"   as const },

    // Side Project – Launch
    { id: "tk-sl-1",      title: "Build landing page",                                  catId: "c-side-launch", done: false, horizon: "week"    as const },
    { id: "tk-sl-2",      title: "Draft Product Hunt launch copy",                      catId: "c-side-launch", done: false, horizon: "month"   as const },

    // Finance
    { id: "tk-fin-1",     title: "Review monthly expenses",                             catId: "c-fin-budget",  done: false, horizon: "month"   as const },
    { id: "tk-fin-2",     title: "Rebalance investment portfolio",                      catId: "c-fin-invest",  done: false, horizon: "month"   as const },
    { id: "tk-fin-3",     title: "Set up automatic savings transfer",                   catId: "c-fin-invest",  done: false, horizon: "someday" as const },

    // ── Overdue — planned last week, still not done ──────────────────────────
    { id: "tk-ov-1",      title: "Migrate CI pipeline to GitHub Actions",               catId: "c-infra-ci",    done: false, horizon: "week"    as const },
    { id: "tk-ov-2",      title: "Conduct user interviews for onboarding flow",         catId: "c-cs-support",  done: false, horizon: "week"    as const },
    { id: "tk-ov-3",      title: "Fix memory leak in background sync worker",           catId: "c-prod-be",     done: false, horizon: "week"    as const },
    { id: "tk-ov-4",      title: "Publish accessibility audit report",                  catId: "c-design-comp", done: false, horizon: "week"    as const },
    { id: "tk-ov-5",      title: "Set up analytics dashboard",                          catId: "c-mkt-content", done: false, horizon: "week"    as const },
    { id: "tk-ov-6",      title: "Negotiate renewal with hosting provider",             catId: "c-fin-budget",  done: false, horizon: "week"    as const },
    { id: "tk-ov-7",      title: "Write post-mortem for last week's incident",          catId: "c-infra-cloud", done: false, horizon: "week"    as const },

    // Legal & Compliance
    { id: "tk-lc-1",      title: "Review vendor contracts before renewal deadline",     catId: "c-lc-contracts", done: false, horizon: "week"    as const },
    { id: "tk-lc-2",      title: "Update privacy policy for GDPR compliance",           catId: "c-lc-comp",      done: false, horizon: "month"   as const },
    { id: "tk-lc-3",      title: "File trademark application for brand name",           catId: "c-lc-comp",      done: false, horizon: "month"   as const },
    { id: "tk-lc-4",      title: "Conduct quarterly compliance audit",                  catId: "c-lc-comp",      done: false, horizon: "week"    as const },
    { id: "tk-lc-5",      title: "Draft employee NDA templates",                        catId: "c-lc-contracts", done: false, horizon: "someday" as const },

    // Research & Dev
    { id: "tk-rd-1",      title: "Literature review on vector database approaches",     catId: "c-rd-research",  done: false, horizon: "week"    as const },
    { id: "tk-rd-2",      title: "Prototype real-time collaboration feature",           catId: "c-rd-exp",       done: true,  horizon: "month"   as const },
    { id: "tk-rd-3",      title: "Evaluate new ML inference frameworks",                catId: "c-rd-research",  done: false, horizon: "week"    as const },
    { id: "tk-rd-4",      title: "Write technical RFC for offline-first sync",          catId: "c-rd-exp",       done: false, horizon: "month"   as const },
    { id: "tk-rd-5",      title: "Benchmark performance against competing products",    catId: "c-rd-research",  done: false, horizon: "week"    as const },

    // People & HR
    { id: "tk-hr-1",      title: "Post senior engineer job listing",                    catId: "c-hr-hiring",    done: false, horizon: "week"    as const },
    { id: "tk-hr-2",      title: "Schedule quarterly performance reviews",              catId: "c-hr-hiring",    done: true,  horizon: "week"    as const },
    { id: "tk-hr-3",      title: "Draft onboarding checklist for new hires",            catId: "c-hr-culture",   done: false, horizon: "month"   as const },
    { id: "tk-hr-4",      title: "Organise virtual team-building event",                catId: "c-hr-culture",   done: false, horizon: "month"   as const },
    { id: "tk-hr-5",      title: "Update company handbook with new policies",           catId: "c-hr-culture",   done: false, horizon: "someday" as const },

    // Sales
    { id: "tk-sa-1",      title: "Follow up with enterprise lead at Globex Corp",       catId: "c-sa-pipeline",  done: false, horizon: "week"    as const },
    { id: "tk-sa-2",      title: "Prepare live demo for ACME Corp meeting",             catId: "c-sa-pipeline",  done: false, horizon: "week"    as const },
    { id: "tk-sa-3",      title: "Update CRM with latest call notes",                   catId: "c-sa-pipeline",  done: false, horizon: "week"    as const },
    { id: "tk-sa-4",      title: "Create case study from most recent win",              catId: "c-sa-outreach",  done: true,  horizon: "month"   as const },
    { id: "tk-sa-5",      title: "Build outreach sequence for SMB segment",             catId: "c-sa-outreach",  done: false, horizon: "month"   as const },

    // Data & Analytics
    { id: "tk-da-1",      title: "Build revenue attribution dashboard",                 catId: "c-da-dash",      done: false, horizon: "week"    as const },
    { id: "tk-da-2",      title: "Fix broken funnel tracking in Mixpanel",              catId: "c-da-quality",   done: false, horizon: "week"    as const },
    { id: "tk-da-3",      title: "Document internal data dictionary",                   catId: "c-da-quality",   done: false, horizon: "month"   as const },
    { id: "tk-da-4",      title: "Set up data quality alerting pipeline",               catId: "c-da-dash",      done: false, horizon: "week"    as const },
    { id: "tk-da-5",      title: "Migrate event data to new data warehouse",            catId: "c-da-dash",      done: false, horizon: "month"   as const },

    // Security
    { id: "tk-se-1",      title: "Rotate all production API keys",                      catId: "c-sec-vuln",     done: false, horizon: "week"    as const },
    { id: "tk-se-2",      title: "Conduct pen test on authentication endpoints",        catId: "c-sec-vuln",     done: true,  horizon: "week"    as const },
    { id: "tk-se-3",      title: "Review third-party dependency vulnerabilities",       catId: "c-sec-vuln",     done: false, horizon: "week"    as const },
    { id: "tk-se-4",      title: "Write incident response playbook",                    catId: "c-sec-policy",   done: false, horizon: "month"   as const },
    { id: "tk-se-5",      title: "Implement Content Security Policy headers",           catId: "c-sec-policy",   done: false, horizon: "week"    as const },

    // Community
    { id: "tk-co-1",      title: "Write weekly community newsletter digest",            catId: "c-comm-social",  done: false, horizon: "week"    as const },
    { id: "tk-co-2",      title: "Moderate Discord and welcome new members",            catId: "c-comm-social",  done: false, horizon: "week"    as const },
    { id: "tk-co-3",      title: "Plan virtual AMA session with the team",              catId: "c-comm-engage",  done: true,  horizon: "month"   as const },
    { id: "tk-co-4",      title: "Gather feedback from top power users",                catId: "c-comm-engage",  done: false, horizon: "week"    as const },
    { id: "tk-co-5",      title: "Create community onboarding guide",                   catId: "c-comm-engage",  done: false, horizon: "month"   as const },

    // Events & Conferences
    { id: "tk-ev-1",      title: "Submit CFP for React Summit 2026",                    catId: "c-ev-speak",     done: false, horizon: "month"   as const },
    { id: "tk-ev-2",      title: "Prepare conference sponsorship deck",                 catId: "c-ev-sponsor",   done: false, horizon: "week"    as const },
    { id: "tk-ev-3",      title: "Book venue for annual user meetup",                   catId: "c-ev-sponsor",   done: false, horizon: "month"   as const },
    { id: "tk-ev-4",      title: "Review past event recordings for highlight reel",     catId: "c-ev-speak",     done: true,  horizon: "week"    as const },
    { id: "tk-ev-5",      title: "Coordinate speaker travel and logistics",             catId: "c-ev-speak",     done: false, horizon: "week"    as const },

    // Partnerships
    { id: "tk-pa-1",      title: "Draft partnership proposal for Stripe",               catId: "c-pa-bd",        done: false, horizon: "week"    as const },
    { id: "tk-pa-2",      title: "Evaluate potential reseller partners in APAC",        catId: "c-pa-bd",        done: false, horizon: "month"   as const },
    { id: "tk-pa-3",      title: "Build integration prototype with Zapier",             catId: "c-pa-int",       done: false, horizon: "week"    as const },
    { id: "tk-pa-4",      title: "Schedule intro call with HubSpot team",               catId: "c-pa-bd",        done: false, horizon: "week"    as const },
    { id: "tk-pa-5",      title: "Document public integration API requirements",        catId: "c-pa-int",       done: false, horizon: "month"   as const },

    // Product Strategy
    { id: "tk-st-1",      title: "Update Q2 product roadmap document",                  catId: "c-st-roadmap",   done: false, horizon: "week"    as const },
    { id: "tk-st-2",      title: "Synthesise insights from last user interviews",       catId: "c-st-research",  done: true,  horizon: "week"    as const },
    { id: "tk-st-3",      title: "Write PRD for notifications feature",                 catId: "c-st-roadmap",   done: false, horizon: "month"   as const },
    { id: "tk-st-4",      title: "Competitive analysis — refresh positioning",          catId: "c-st-research",  done: false, horizon: "week"    as const },
    { id: "tk-st-5",      title: "Define success metrics for upcoming release",         catId: "c-st-roadmap",   done: false, horizon: "month"   as const },
  ];

  // Build the tasks array for the backup.
  // orderToken only needs to be unique within a category; use the task's
  // position index modulo the key pool size.
  const backupTasks = tasks.map((tk, i) => ({
    id: tk.id,
    title: tk.title,
    state: tk.done ? ("done" as const) : ("todo" as const),
    projectCategoryId: tk.catId,
    orderToken: K[i % K.length],
    lastToggledAt: tk.done ? t(500_000 - i * 10_000) : 0,
    createdAt: t(5_000_000 - i * 50_000),
    horizon: tk.horizon,
    templateId: null,
    templateDate: null,
  }));

  // ── Daily lists & projections ────────────────────────────────────────────────
  // Current week: 5 unique task IDs per day, Mon=0 … Sun=6.
  const projectionSlots: string[][] = [
    /* Mon */ ["tk-be-1",    "tk-dc-2",   "tk-mc-1",    "tk-hw-2",   "tk-sm-1",   "tk-sa-1",  "tk-se-1",  "tk-st-1"],
    /* Tue */ ["tk-fe-1",    "tk-dt-1",   "tk-ci-1",    "tk-gc-1",   "tk-sl-1",   "tk-rd-1",  "tk-da-1",  "tk-pa-1"],
    /* Wed */ ["tk-mob-1",   "tk-seo-1",  "tk-cloud-1", "tk-cs-1",   "tk-gr-2",   "tk-lc-2",  "tk-co-1",  "tk-st-4"],
    /* Thu */ ["tk-fe-3",    "tk-dc-3",   "tk-mc-2",    "tk-hw-3",   "tk-cd-1",   "tk-hr-1",  "tk-da-4",  "tk-ev-2"],
    /* Fri */ ["tk-be-3",    "tk-dt-2",   "tk-ci-2",    "tk-gc-2",   "tk-hn-1",   "tk-sa-2",  "tk-se-3",  "tk-co-4"],
    /* Sat */ ["tk-inbox-1", "tk-fe-4",   "tk-dc-4",    "tk-hw-1",   "tk-sm-2",   "tk-rd-3",  "tk-lc-1"],
    /* Sun */ ["tk-be-2",    "tk-fe-2",   "tk-dc-1",    "tk-gr-1",   "tk-hn-2",   "tk-pa-4"],
  ];

  // Previous week: mix of completed tasks and overdue tasks not done last week.
  const prevProjectionSlots: string[][] = [
    /* Mon */ ["tk-ov-1",  "tk-ov-2",  "tk-rd-2",  "tk-hr-2"],
    /* Tue */ ["tk-ov-3",  "tk-ov-4",  "tk-sa-4",  "tk-st-2"],
    /* Wed */ ["tk-ov-5",  "tk-se-2",  "tk-co-3"],
    /* Thu */ ["tk-ov-6",  "tk-ov-7",  "tk-ev-4"],
    /* Fri */ ["tk-lc-4",  "tk-rd-5",  "tk-hr-4"],
    /* Sat */ ["tk-da-2",  "tk-se-5"],
    /* Sun */ ["tk-ev-5",  "tk-pa-3"],
  ];

  const dailyLists = [
    ...days.map((date, i) => ({ id: `list-day-${i}`, date: dmy(date) })),
    ...prevWeekDays.map((date, i) => ({ id: `list-prev-${i}`, date: dmy(date) })),
  ];

  const dailyListProjections = [
    ...days.flatMap((_, dayIdx) => {
      const listId = `list-day-${dayIdx}`;
      return (projectionSlots[dayIdx] ?? []).map((taskId, pos) => ({
        id: taskId,
        orderToken: K[pos],
        listId,
        createdAt: t(200_000 - dayIdx * 10_000 - pos * 1_000),
      }));
    }),
    ...prevWeekDays.flatMap((_, dayIdx) => {
      const listId = `list-prev-${dayIdx}`;
      return (prevProjectionSlots[dayIdx] ?? []).map((taskId, pos) => ({
        id: taskId,
        orderToken: K[pos],
        listId,
        createdAt: t(1_400_000 - dayIdx * 10_000 - pos * 1_000),
      }));
    }),
  ];

  return {
    projects,
    projectCategories,
    tasks: backupTasks,
    taskTemplates: [],
    dailyLists,
    dailyListProjections,
  };
}
