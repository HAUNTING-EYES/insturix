import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// The Terms content is preserved verbatim; only layout and styling have been updated to match site design.
export default function Terms() {
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
              <h1 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold primtext">Terms and Conditions</h1>
              <p className="mt-3 text-sm text-muted-foreground">Last Updated: April 10, 2025</p>
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
                    <li><a href="#welcome" className="hover:text-foreground">Welcome</a></li>
                    <li><a href="#acceptance-of-terms" className="hover:text-foreground">1. Acceptance of Terms</a></li>
                    <li><a href="#services-overview" className="hover:text-foreground">2. Services Overview</a></li>
                    <li><a href="#eligibility" className="hover:text-foreground">3. Eligibility</a></li>
                    <li><a href="#protection-policy-terms" className="hover:text-foreground">4. Protection Policy Terms</a></li>
                    <li><a href="#user-responsibilities" className="hover:text-foreground">5. User Responsibilities</a></li>
                    <li><a href="#account-registration" className="hover:text-foreground">6. Account Registration and Security</a></li>
                    <li><a href="#payment-and-fees" className="hover:text-foreground">7. Payment and Fees</a></li>
                    <li><a href="#disclaimer" className="hover:text-foreground">8. Disclaimer of Warranties</a></li>
                    <li><a href="#limitation" className="hover:text-foreground">9. Limitation of Liability</a></li>
                    <li><a href="#ip-rights" className="hover:text-foreground">10. Intellectual Property Rights</a></li>
                    <li><a href="#prohibited" className="hover:text-foreground">11. Prohibited Conduct</a></li>
                    <li><a href="#privacy-policy" className="hover:text-foreground">12. Privacy Policy</a></li>
                    <li><a href="#third-party-links" className="hover:text-foreground">13. Third-Party Links</a></li>
                    <li><a href="#modifications" className="hover:text-foreground">14. Modification of T&Cs</a></li>
                    <li><a href="#termination" className="hover:text-foreground">15. Termination of Access</a></li>
                    <li><a href="#governing-law" className="hover:text-foreground">16. Governing Law & Disputes</a></li>
                    <li><a href="#contact" className="hover:text-foreground">17. Contact Information</a></li>
                  </ol>
                </nav>
              </div>
            </aside>

            {/* Main */}
            <main className="scroll-smooth space-y-6 lg:space-y-8">
              {/* Welcome */}
              <section id="welcome" className="section-card scroll-mt-24">
                <h2 className="text-lg font-semibold primtext mb-2">Welcome to INSTURIX!</h2>
                <p className="text-muted-foreground leading-relaxed">
                  These Terms and Conditions (&quot;T&Cs&quot;) govern your access to and use of the INSTURIX website and the services provided by INSTURIX (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). By accessing or using the Website, you agree to be bound by these T&Cs.
                </p>
              </section>

              {/* 1 */}
              <section id="acceptance-of-terms" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">1. Acceptance of Terms</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  By using this Website, you accept and agree to comply with these T&Cs. If you do not agree to these T&Cs, please do not use the Website.
                </p>
              </section>

              {/* 2 */}
              <section id="services-overview" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">2. Services Overview</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  We provide digital protection policies and SaaS products for content creators on platforms such as Instagram.
                </p>
              </section>

              {/* 3 */}
              <section id="eligibility" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">3. Eligibility</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  By using our Website, you confirm that you are at least 18 years old and have the legal capacity to enter into binding agreements.
                </p>
              </section>

              {/* 4 */}
              <section id="protection-policy-terms" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">4. Protection Policy Terms</h3>
                <div className="mt-3 text-foreground/80 leading-relaxed space-y-4">
                  <p>For clients enrolled in our Protection Policy:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>
                      <strong>Coverage:</strong>
                      <span className="ml-1"> Detailed information on the protection services, coverage, and limitations is outlined in the Protection Policy Document.</span>
                    </li>
                    <li>
                      <strong>Exclusions:</strong>
                      <span className="ml-1"> Certain cases, as detailed in the Protection Policy Document, are not covered.</span>
                    </li>
                    <li>
                      <strong>Non-Insurance Clause:</strong>
                      <span className="ml-1"> Our Protection Policy is not an insurance policy. It provides specialized support and services without conferring legal insurance status.</span>
                    </li>
                  </ul>
                </div>
              </section>

              {/* 5 */}
              <section id="user-responsibilities" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">5. User Responsibilities</h3>
                <div className="mt-3 text-foreground/80 leading-relaxed space-y-4">
                  <p>
                    By using this Website and/or subscribing to our Protection Policy, you agree to:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Provide accurate, current, and complete information as required.</li>
                    <li>Maintain the confidentiality of your account credentials and notify us immediately of any unauthorized use.</li>
                    <li>Not engage in activities that violate these T&Cs, any applicable law, or the rights of others.</li>
                  </ul>
                </div>
              </section>

              {/* 6 */}
              <section id="account-registration" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">6. Account Registration and Security</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  To access certain features, you may be required to create an account. You agree to provide accurate and complete registration information, update your information as necessary, and maintain the security of your account and notify us of any unauthorized access.
                </p>
              </section>

              {/* 7 */}
              <section id="payment-and-fees" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">7. Payment and Fees</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  Fees for our services are detailed on the Website and in the Protection Policy Document. Payments are due in full upon enrolling in the policy. All fees are non-refundable except as specified in our Refund Policy. We reserve the right to modify fees at any time, with prior notice being posted on the Website or sent by email.
                </p>
              </section>

              {/* 8 */}
              <section id="disclaimer" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">8. Disclaimer of Warranties</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  The Website and all content and services are provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE& quot; basis. We disclaim all warranties, express or implied, including but not limited to the accuracy, completeness, or suitability of information on the Website. We do not guarantee uninterrupted, error-free, or virus-free access to the Website.
                </p>
              </section>

              {/* 9 */}
              <section id="limitation" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">9. Limitation of Liability</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  To the fullest extent permitted by law: INSTURIX and its affiliates shall not be liable for any direct, indirect, incidental, or consequential damages, including but not limited to loss of profits, data, or use, arising from the use of the Website or our services. Our total liability for any claims relating to the use of our services shall be limited to the amount paid by you for the services in the preceding 6 months.
                </p>
              </section>

              {/* 10 */}
              <section id="ip-rights" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">10. Intellectual Property Rights</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  All content on the Website, including but not limited to text, images, logos, and software, is owned by INSTURIX or licensed to us. You are granted a limited, non-exclusive, non-transferable right to access and use the Website for personal and non-commercial purposes. You may not reproduce, distribute, or create derivative works without our express written consent.
                </p>
              </section>

              {/* 11 */}
              <section id="prohibited" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">11. Prohibited Conduct</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  You agree not to: engage in any form of data scraping, data extraction, or similar activity; use the Website to infringe on the rights of others or promote illegal activities; or bypass or attempt to bypass any security measures on the Website.
                </p>
              </section>

              {/* 12 */}
              <section id="privacy-policy" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">12. Privacy Policy</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  Our Privacy Policy outlines how we collect, use, and protect your personal information. By using the Website, you agree to the practices described in our Privacy Policy.
                </p>
              </section>

              {/* 13 */}
              <section id="third-party-links" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">13. Third-Party Links</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  Our Website may contain links to third-party websites or resources. We are not responsible for the availability or accuracy of these resources or their content.
                </p>
              </section>

              {/* 14 */}
              <section id="modifications" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">14. Modification of T&amp;Cs</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  We reserve the right to modify these T&Cs at any time. Changes will be posted on the Website and, where feasible, notified to users via email. Continued use of the Website after changes are made constitutes acceptance of the new T&Cs.
                </p>
              </section>

              {/* 15 */}
              <section id="termination" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">15. Termination of Access</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  We reserve the right to suspend or terminate your access to the Website and services at our discretion, including for any violation of these T&Cs.
                </p>
              </section>

              {/* 16 */}
              <section id="governing-law" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">16. Governing Law and Dispute Resolution</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  These T&Cs and any disputes arising from them shall be governed by and construed in accordance with the laws of India. Any disputes shall be resolved through arbitration in Delhi, India, in accordance with Indian Arbitration and Conciliation laws.
                </p>
              </section>

              {/* 17 */}
              <section id="contact" className="section-card scroll-mt-24">
                <h3 className="text-xl font-semibold primtext">17. Contact Information</h3>
                <div className="mt-3 space-y-2 text-foreground/80 leading-relaxed">
                  <p>If you have any questions about these T&Cs, please contact us at:</p>
                  <div className="mt-4 grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="font-semibold">INSTURIX</p>
                      <p>+91 92201 21372</p>
                      <p>support@insturix.com</p>
                      <p>www.insturix.com</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Acknowledgement */}
              <section className="section-card">
                <p className="text-foreground/80">
                  By using INSTURIX, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.
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
