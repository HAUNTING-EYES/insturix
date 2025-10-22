import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// Layout updated to match site design; policy text remains unchanged.
export default function RefundPolicy() {
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
              <h1 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold primtext">Refund Policy</h1>
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
                    <li><a href="#overview" className="hover:text-foreground">Refund Policy Overview</a></li>
                    <li><a href="#no-refund-areas" className="hover:text-foreground">1. Strict No-Refund Areas</a></li>
                    <li><a href="#eligibility-exceptions" className="hover:text-foreground">2. Refund Eligibility – Exception Cases</a></li>
                    <li><a href="#request-process" className="hover:text-foreground">3. Refund Request Process</a></li>
                    <li><a href="#third-party" className="hover:text-foreground">4. Third-Party Payment Services</a></li>
                    <li><a href="#final-clause" className="hover:text-foreground">5. Final Clause</a></li>
                    <li><a href="#contact" className="hover:text-foreground">Contact Information</a></li>
                  </ol>
                </nav>
              </div>
            </aside>

            {/* Main */}
            <main className="scroll-smooth space-y-6 lg:space-y-8">
              {/* Overview */}
              <section id="overview" className="section-card scroll-mt-24">
                <h2 className="text-lg font-semibold primtext mb-2">Refund Policy Overview</h2>
                <p className="text-foreground/80 leading-relaxed">
                  Insturix provides advanced AI systems and digital services built on real-time infrastructure. Due to the automated nature of our offerings, refund eligibility is limited and subject to strict conditions.
                </p>
              </section>

              {/* 1 */}
              <section id="no-refund-areas" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">1. Strict No-Refund Areas</h3>
                <ul className="mt-3 list-disc pl-6 space-y-2 text-foreground/80 leading-relaxed">
                  <li>Executed commands and AI actions (e.g., code generations, AI-based video edits, business analytics, content scripts).</li>
                  <li>Partially used or fully used subscription periods.</li>
                  <li>Services consumed as part of bundled offerings or promotional packages.</li>
                  <li>Failure to cancel a subscription before renewal.</li>
                  <li>Dissatisfaction after usage without a provable technical error.</li>
                  <li>Buyer’s remorse or change of mind.</li>
                </ul>
                <p className="mt-4 text-foreground/80 leading-relaxed">
                  Insturix's systems begin service execution instantly upon receiving commands, making reversals or rollbacks technically and operationally infeasible.
                </p>
              </section>

              {/* 2 */}
              <section id="eligibility-exceptions" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">2. Refund Eligibility – Exception Cases</h3>
                <ul className="mt-3 list-disc pl-6 space-y-2 text-foreground/80 leading-relaxed">
                  <li><span className="font-semibold">Technical Failure:</span> If a paid service fails to deliver due to a backend system issue not caused by the user.</li>
                  <li><span className="font-semibold">Duplicate Charges:</span> Verified duplicate payments on the same account within the same billing cycle.</li>
                  <li><span className="font-semibold">Payment Gateway Errors:</span> Accidental double charges due to gateway processing problems (with supporting documentation).</li>
                  <li><span className="font-semibold">Pre-execution Cancellation:</span> In rare cases where a manually placed custom order (not an automated command) is canceled within 2 hours and before service has begun.</li>
                </ul>
              </section>

              {/* 3 */}
              <section id="request-process" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">3. Refund Request Process</h3>
                <ol className="mt-3 list-decimal pl-6 space-y-2 text-foreground/80 leading-relaxed">
                  <li>Email <a href="mailto:support@insturix.com" className="font-semibold hover:underline">support@insturix.com</a></li>
                  <li>Include:
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                      <li>Full name and account email</li>
                      <li>Transaction ID(s)</li>
                      <li>Date of payment</li>
                      <li>Reason for request</li>
                      <li>Any applicable screenshots or logs</li>
                    </ul>
                  </li>
                </ol>
                <p className="mt-4 text-foreground/80 leading-relaxed">
                  Our team will review all refund requests and respond within 5–7 business days. Approved refunds are typically processed within 7–10 business days, depending on your bank/payment provider.
                </p>
              </section>

              {/* 4 */}
              <section id="third-party" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">4. Third-Party Payment Services</h3>
                <ul className="mt-3 list-disc pl-6 space-y-2 text-foreground/80 leading-relaxed">
                  <li>Insturix is not liable for delays caused by:</li>
                  <ul className="list-disc pl-6 mt-2 space-y-1">
                    <li>Bank processing times</li>
                    <li>Payment gateway disruptions</li>
                    <li>Currency conversion issues</li>
                  </ul>
                  <li>However, we will fully cooperate with users to facilitate resolution.</li>
                </ul>
              </section>

              {/* 5 */}
              <section id="final-clause" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">5. Final Clause</h3>
                <ul className="mt-3 list-disc pl-6 space-y-2 text-foreground/80 leading-relaxed">
                  <li>All refund decisions are made at the sole discretion of Insturix and are considered final.</li>
                  <li>Abuse of refund policies may lead to account suspension or termination of account.</li>
                </ul>
              </section>

              {/* Contact */}
              <section id="contact" className="section-card scroll-mt-24">
                <h3 className="text-xl font-semibold primtext">Contact Information</h3>
                <ul className="mt-3 space-y-2 text-foreground/80 leading-relaxed">
                  <li>Support Email: <a href="mailto:support@insturix.com" className="font-semibold hover:underline">support@insturix.com</a></li>
                  <li>Legal Queries: <a href="mailto:legal@insturix.com" className="font-semibold hover:underline">legal@insturix.com</a></li>
                  <li>Website: <a href="https://www.insturix.com" className="font-semibold hover:underline">www.insturix.com</a></li>
                </ul>
              </section>

              {/* Acknowledgement */}
              <section className="section-card">
                <p className="text-foreground/80">
                  By using Insturix, you acknowledge that you have read, understood, and agree to be bound by this Refund Policy.
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