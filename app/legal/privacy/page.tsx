import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// Layout updated to match site design; privacy text remains unchanged.
export default function Privacy() {
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
              <h1 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold primtext">Privacy Policy</h1>
              <p className="mt-3 text-sm text-muted-foreground">Effective Date: 10 April 2025</p>
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
                    <li><a href="#welcome" className="hover:text-foreground">Introduction</a></li>
                    <li><a href="#information-we-collect" className="hover:text-foreground">1. Information We Collect</a></li>
                    <li><a href="#how-we-use" className="hover:text-foreground">2. How We Use Your Information</a></li>
                    <li><a href="#how-we-share" className="hover:text-foreground">3. How We Share Your Information</a></li>
                    <li><a href="#storage-security" className="hover:text-foreground">4. Data Storage and Security</a></li>
                    <li><a href="#your-rights" className="hover:text-foreground">5. Your Rights</a></li>
                    <li><a href="#cookies-tracking" className="hover:text-foreground">6. Cookies and Tracking Technologies</a></li>
                    <li><a href="#third-party-links" className="hover:text-foreground">7. Third-Party Links</a></li>
                    <li><a href="#childrens-privacy" className="hover:text-foreground">8. Children&apos;s Privacy</a></li>
                    <li><a href="#changes" className="hover:text-foreground">9. Changes to This Privacy Policy</a></li>
                    <li><a href="#contact" className="hover:text-foreground">10. Contact Us</a></li>
                  </ol>
                </nav>
              </div>
            </aside>

            {/* Main */}
            <main className="scroll-smooth space-y-6 lg:space-y-8">
              {/* Introduction */}
              <section id="welcome" className="section-card scroll-mt-24">
                <h2 className="text-lg font-semibold primtext mb-2">Welcome to INSTURIX</h2>
                <p className="text-foreground/80 leading-relaxed">
                  We are committed to protecting your privacy and ensuring the security of your personal data. This Privacy Policy explains how we collect, use, disclose, and protect your information when you use our services, including the Protection Policy(Shield), Content Analyzer(Alyzitron), AI Video Editor(Editron), and Creator-Business Platform(Meditron), AI Music Gen(musitron).<br />
                  By accessing or using our services, you agree to the terms outlined in this Privacy Policy.
                </p>
              </section>

              {/* 1 */}
              <section id="information-we-collect" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">1. Information We Collect</h3>
                <div className="mt-3 space-y-6 text-foreground/80 leading-relaxed">
                  <div>
                    <h4 className="font-semibold">1.1 Personal Information</h4>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Name, email address, phone number, and other contact details.</li>
                      <li>Social media account details (e.g., usernames, follower count, engagement metrics).</li>
                      <li>Payment information for subscription-based services.</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold">1.2 Uploaded Content</h4>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Media files, captions, or other content uploaded for analysis, editing, or promotional purposes.</li>
                      <li>Business promotional material submitted for campaigns.</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold">1.3 Usage Data</h4>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Information about how you use our services (e.g., login times, feature usage, search queries).</li>
                      <li>Device information, including IP address, browser type, and operating system.</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold">1.4 Third-Party Information</h4>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Publicly available information from social media platforms for account analysis and verification.</li>
                      <li>Business details for creating and managing campaigns on the Creator-Business Platform.</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* 2 */}
              <section id="how-we-use" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">2. How We Use Your Information</h3>
                <ul className="mt-3 list-disc pl-6 space-y-2 text-foreground/80 leading-relaxed">
                  <li>Provide and improve our services, including content analysis, account evaluation, video editing, and creator-business matchmaking.</li>
                  <li>Personalize your experience based on your preferences and history.</li>
                  <li>Facilitate connections between creators and businesses for sponsorship campaigns (MEDITRON).</li>
                  <li>Communicate with you about updates, subscriptions, support, and sponsorship opportunities.</li>
                  <li>Send company updates, product announcements, newsletters, and other informational communications via email to keep you informed about our services and website developments.</li>
                  <li>Process payments, manage billing, and issue refunds when applicable.</li>
                  <li>Comply with legal obligations and prevent fraud or misuse.</li>
                </ul>
              </section>

              {/* 3 */}
              <section id="how-we-share" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">3. How We Share Your Information</h3>
                <div className="mt-3 space-y-4 text-foreground/80 leading-relaxed">
                  <div>
                    <h4 className="font-semibold">3.1 Service Providers</h4>
                    <p>With trusted third-party providers who assist in hosting, payment processing, and technical support.</p>
                  </div>
                  <div>
                    <h4 className="font-semibold">3.2 Legal Obligations</h4>
                    <p>To comply with laws, regulations, or legal requests.</p>
                  </div>
                  <div>
                    <h4 className="font-semibold">3.3 Business Transfers</h4>
                    <p>In the event of a merger, acquisition, or sale of assets, your data may be transferred to the new entity.</p>
                  </div>
                  <div>
                    <h4 className="font-semibold">3.4 Creator-Business Platform (MEDITRON)</h4>
                    <p>When you participate in campaigns, relevant details (e.g., niche, follower count, engagement metrics) may be shared with businesses or creators as necessary to facilitate collaboration.</p>
                  </div>
                </div>
              </section>

              {/* 4 */}
              <section id="storage-security" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">4. Data Storage and Security</h3>
                <ul className="mt-3 list-disc pl-6 space-y-2 text-foreground/80 leading-relaxed">
                  <li>Your data is stored on secure servers with encryption and access controls.</li>
                  <li>We retain your information only as long as necessary to fulfill our services or comply with legal obligations.</li>
                  <li>While we strive to protect your data, no system is 100% secure, and we cannot guarantee absolute security.</li>
                </ul>
              </section>

              {/* 5 */}
              <section id="your-rights" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">5. Your Rights</h3>
                <div className="mt-3 grid md:grid-cols-2 gap-4 text-foreground/90">
                  <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                    <h4 className="font-semibold">Access and Portability</h4>
                    <p className="text-sm">Request a copy of your data.</p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                    <h4 className="font-semibold">Correction</h4>
                    <p className="text-sm">Update or correct inaccurate information.</p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                    <h4 className="font-semibold">Deletion</h4>
                    <p className="text-sm">Request the deletion of your data, subject to legal requirements.</p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                    <h4 className="font-semibold">Objection</h4>
                    <p className="text-sm">Opt-out of certain uses of your data, such as marketing emails.</p>
                  </div>
                </div>
                <div className="mt-6 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                  <p>
                    To exercise these rights, contact us at {" "}
                    <a href="mailto:support@insturix.com" className="font-semibold hover:underline">
                      support@insturix.com
                    </a>
                  </p>
                </div>
              </section>

              {/* 6 */}
              <section id="cookies-tracking" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">6. Cookies and Tracking Technologies</h3>
                <ul className="mt-3 list-disc pl-6 space-y-2 text-foreground/80 leading-relaxed">
                  <li>Enhance your experience on our website and services.</li>
                  <li>Analyze user behavior to improve our offerings.</li>
                  <li>Track campaign performance for creators and businesses.</li>
                </ul>
                <p className="mt-2 text-foreground/80">You can manage cookie preferences in your browser settings.</p>
              </section>

              {/* 7 */}
              <section id="third-party-links" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">7. Third-Party Links</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  Our services may include links to third-party websites. We are not responsible for their privacy practices and encourage you to review their policies.
                </p>
              </section>

              {/* 8 */}
              <section id="childrens-privacy" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">8. Children&apos;s Privacy</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  Our services are not intended for individuals under 13 years of age. We do not knowingly collect personal data from children.
                </p>
              </section>

              {/* 9 */}
              <section id="changes" className="section-card scroll-mt-24 border-l-2 border-l-neutral-300 dark:border-l-neutral-700">
                <h3 className="text-xl font-semibold primtext">9. Changes to This Privacy Policy</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">
                  We may update this policy to reflect changes in our practices, services, or legal requirements. Significant changes will be communicated via email or our website.
                </p>
              </section>

              {/* 10 */}
              <section id="contact" className="section-card scroll-mt-24">
                <h3 className="text-xl font-semibold primtext">10. Contact Us</h3>
                <p className="mt-3 text-foreground/80 leading-relaxed">For questions or concerns about this Privacy Policy, contact us at:</p>
                <div className="mt-3 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                  <p>
                    Email: {" "}
                    <a href="mailto:support@insturix.com" className="font-semibold hover:underline">
                      support@insturix.com
                    </a>
                  </p>
                </div>
              </section>

              {/* Acknowledgement */}
              <section className="section-card">
                <p className="text-foreground/80">
                  By using INSTURIX, you acknowledge that you have read, understood, and agree to be bound by this Privacy Policy.
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
