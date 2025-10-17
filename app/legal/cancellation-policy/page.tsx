import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// Layout updated to match site design; policy text remains unchanged.
export default function CancellationPolicy() {
  return (
    <>
      <Navbar />
      <div id="top" className="min-h-screen bg-[rgb(var(--surface-0))]">
        {/* Hero */}
        <section className="relative border-b border-neutral-200/60 dark:border-neutral-800/60">
          <div className="absolute inset-0 bg-grid-neutral-100/20 dark:bg-grid-neutral-900/20 bg-[size:24px_24px] opacity-40" />
          <div className="container relative mx-auto px-4 py-14 sm:py-16">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Legal</p>
              <h1 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold primtext">Cancellation Policy</h1>
              <p className="mt-3 text-sm text-muted-foreground">Effective Date: July 13, 2025</p>
            </div>
          </div>
        </section>

        {/* Content with sticky ToC */}
        <div className="container mx-auto px-4 py-10 lg:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-8 lg:gap-12">
            {/* ToC */}
            <aside className="hidden lg:block">
              <div className="sticky top-24 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">On this page</p>
                <nav className="text-sm text-muted-foreground">
                  <ol className="space-y-2">
                    <li><a href="#intro" className="hover:text-foreground">Introduction</a></li>
                    <li><a href="#general-policy-overview" className="hover:text-foreground">1. General Policy Overview</a></li>
                    <li><a href="#cancel-subscription-plans" className="hover:text-foreground">2. Cancellation of Subscription Plans</a></li>
                    <li><a href="#cancel-commands-orders" className="hover:text-foreground">3. Cancellation of Commands, Orders, or Executed Services</a></li>
                    <li><a href="#automated-services" className="hover:text-foreground">4. Automated Services &amp; No Manual Interventions</a></li>
                    <li><a href="#termination-by-insturix" className="hover:text-foreground">5. Termination by Insturix</a></li>
                    <li><a href="#how-to-cancel" className="hover:text-foreground">6. How to Cancel a Plan</a></li>
                  </ol>
                </nav>
              </div>
            </aside>

            {/* Main */}
            <main className="scroll-smooth space-y-6 lg:space-y-8">
              {/* Introduction */}
              <section id="intro" className="section-card scroll-mt-24">
                <h2 className="text-lg font-semibold primtext mb-2">Transparency and Integrity</h2>
                <p className="text-foreground/80 leading-relaxed">
                  At <span className="font-bold">Insturix</span>, transparency and integrity are at the core of our policies. As we provide AI-driven digital services and tools, this cancellation policy has been drafted to ensure fairness while protecting the integrity of our operations and digital infrastructure.
                </p>
              </section>

              {/* 1 */}
              <section id="general-policy-overview" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">1. General Policy Overview</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  Insturix offers Platform-as-a-service (PaaS) and AI-powered solutions. Due to the automated and digital nature of our Platform, cancellations are only applicable to ongoing subscription plans, not on individual actions or executed commands.
                </p>
              </section>

              {/* 2 */}
              <section id="cancel-subscription-plans" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">2. Cancellation of Subscription Plans</h3>
                <ul className="mt-3 list-disc pl-6 space-y-2 text-foreground/80 leading-relaxed">
                  <li>Customers have the right to cancel their active subscription plans at any time via their account dashboard.</li>
                  <li>Upon cancellation, the subscription remains active until the end of the billing cycle as outlined in the original plan description.</li>
                  <li>No refunds or partial refunds will be issued for unused days in the active period.</li>
                  <li>All plan-based services and access rights will be automatically terminated at the end of the current billing period.</li>
                  <li>Users will receive a confirmation email upon successful cancellation.</li>
                </ul>
              </section>

              {/* 3 */}
              <section id="cancel-commands-orders" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">3. Cancellation of Commands, Orders, or Executed Services</h3>
                <ul className="mt-3 list-disc pl-6 space-y-2 text-foreground/80 leading-relaxed">
                  <li>Once a command is executed (e.g., an AI request, project generation, code execution, business report generation, video editing job, etc.), it is final and irreversible.</li>
                  <li>This includes actions initiated on platforms such as Editron, ThinkForge, Musitron, Alyzitron, or any other service offered by Insturix.</li>
                  <li>No cancellations, pauses, or amendments are permitted after an order or command has been submitted, as our systems allocate computational and human resources in real time.</li>
                </ul>
              </section>

              {/* 4 */}
              <section id="automated-services" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">4. Automated Services &amp; No Manual Interventions</h3>
                <ul className="mt-3 list-disc pl-6 space-y-2 text-foreground/80 leading-relaxed">
                  <li>Many Insturix tools operate in real time with minimal human intervention.</li>
                  <li>Once a service is triggered, backend systems and AI modules begin immediate processing.</li>
                  <li>For this reason, manual override or cancellation requests cannot be accommodated after initiation.</li>
                </ul>
              </section>

              {/* 5 */}
              <section id="termination-by-insturix" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">5. Termination by Insturix</h3>
                <ul className="mt-3 list-disc pl-6 space-y-2 text-foreground/80 leading-relaxed">
                  <li>We reserve the right to cancel a user’s access or subscription at our sole discretion in the following cases:
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                      <li>Violation of our Terms of Use</li>
                      <li>Fraudulent behavior or misuse of AI systems</li>
                      <li>Unauthorized commercial redistribution of our services</li>
                      <li>Use of our tools for harmful or unethical purposes</li>
                    </ul>
                  </li>
                  <li>In such cases, no refund or compensation will be provided.</li>
                </ul>
              </section>

              {/* 6 */}
              <section id="how-to-cancel" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">6. How to Cancel a Plan</h3>
                <ol className="mt-3 list-decimal pl-6 space-y-2 text-foreground/80 leading-relaxed">
                  <li>Go to your Insturix Account</li>
                  <li>Navigate to “Manage Plan” &gt; “Cancel Subscription”</li>
                  <li>Follow the confirmation steps</li>
                  <li>A confirmation email will be sent immediately</li>
                </ol>
                <div className="mt-6 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                  <p>
                    For any cancellation support, contact us at {" "}
                    <a href="mailto:support@insturix.com" className="font-semibold hover:underline">
                      support@insturix.com
                    </a>
                  </p>
                </div>
              </section>

              {/* Acknowledgement */}
              <section className="section-card">
                <p className="text-foreground/80">
                  By using Insturix, you acknowledge that you have read, understood, and agree to be bound by this Cancellation & Refund Policy.
                </p>
              </section>

              {/* Back to top */}
              <div className="flex justify-end">
                <a href="#top" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">Back to top ↑</a>
              </div>
            </main>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}