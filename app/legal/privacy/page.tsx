import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function Privacy() {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-slate-100 dark:from-gray-900 dark:via-blue-950/30 dark:to-slate-900 transition-all duration-500 font-sans">
        <div className="container mx-auto px-4 py-40 max-w-5xl">
          {/* Header Section */}
          <div className="text-center mb-16 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 dark:from-blue-400/10 dark:to-purple-400/10 blur-3xl -z-10"></div>
            <h1 className="text-5xl md:text-7xl font-extrabold bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 dark:from-blue-400 dark:via-purple-400 dark:to-blue-300 bg-clip-text text-transparent mb-10 tracking-tight">
              Privacy Policy
            </h1>
            <div className="inline-flex items-center bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white px-6 py-3 rounded-full text-sm font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
              Effective Date: 10 April 2025
            </div>
          </div>

          {/* Introduction */}
          <div className="relative mb-12 group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10 dark:from-blue-400/5 dark:to-purple-400/5 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
            <div className="relative bg-gradient-to-r from-blue-600/5 to-blue-700/5 dark:from-blue-400/3 dark:to-blue-500/3 rounded-3xl shadow-xl dark:shadow-2xl p-8 md:p-10 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-2xl dark:hover:shadow-blue-500/20 transition-all duration-500">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-500 rounded-2xl flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                    Welcome to INSTURIX
                  </h3>
                  <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                    We are committed to protecting your privacy and ensuring the security of your personal data. This Privacy Policy explains how we collect, use, disclose, and protect your information when you use our services, including the Protection Policy(Shield), Content Analyzer(Alyzitron), AI Video Editor(Editron), and Creator-Business Platform(Meditron), AI Music Gen(musitron).<br />
                    By accessing or using our services, you agree to the terms outlined in this Privacy Policy.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Policy Sections */}
          <div className="space-y-8">
            {/* Section 1: Information We Collect */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-600/5 to-gray-700/5 dark:from-gray-400/3 dark:to-gray-500/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">1</span>
                  Information We Collect
                </h3>
                <div className="space-y-6">
                  <div className="border-l-4 border-blue-600 dark:border-blue-400 pl-6">
                    <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1.1 Personal Information</h4>
                    <ul className="text-gray-700 dark:text-gray-300 space-y-2">
                      <li>Name, email address, phone number, and other contact details.</li>
                      <li>Social media account details (e.g., usernames, follower count, engagement metrics).</li>
                      <li>Payment information for subscription-based services.</li>
                    </ul>
                  </div>
                  <div className="border-l-4 border-purple-600 dark:border-purple-400 pl-6">
                    <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1.2 Uploaded Content</h4>
                    <ul className="text-gray-700 dark:text-gray-300 space-y-2">
                      <li>Media files, captions, or other content uploaded for analysis, editing, or promotional purposes.</li>
                      <li>Business promotional material submitted for campaigns.</li>
                    </ul>
                  </div>
                  <div className="border-l-4 border-blue-600 dark:border-blue-400 pl-6">
                    <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1.3 Usage Data</h4>
                    <ul className="text-gray-700 dark:text-gray-300 space-y-2">
                      <li>Information about how you use our services (e.g., login times, feature usage, search queries).</li>
                      <li>Device information, including IP address, browser type, and operating system.</li>
                    </ul>
                  </div>
                  <div className="border-l-4 border-purple-600 dark:border-purple-400 pl-6">
                    <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1.4 Third-Party Information</h4>
                    <ul className="text-gray-700 dark:text-gray-300 space-y-2">
                      <li>Publicly available information from social media platforms for account analysis and verification.</li>
                      <li>Business details for creating and managing campaigns on the Creator-Business Platform.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: How We Use Your Information */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 to-blue-600/5 dark:from-purple-400/3 dark:to-blue-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-purple-600 to-blue-700 dark:from-purple-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">2</span>
                  How We Use Your Information
                </h3>
                <ul className="text-gray-700 dark:text-gray-300 space-y-3 text-lg">
                  <li>Provide and improve our services, including content analysis, account evaluation, video editing, and creator-business matchmaking.</li>
                  <li>Personalize your experience based on your preferences and history.</li>
                  <li>Facilitate connections between creators and businesses for sponsorship campaigns (MEDITRON).</li>
                  <li>Communicate with you about updates, subscriptions, support, and sponsorship opportunities.</li>
                  <li>Process payments, manage billing, and issue refunds when applicable.</li>
                  <li>Comply with legal obligations and prevent fraud or misuse.</li>
                </ul>
              </div>
            </section>

            {/* Section 3: How We Share Your Information */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-purple-600/5 dark:from-blue-400/3 dark:to-purple-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-blue-600 to-purple-700 dark:from-blue-500 dark:to-purple-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">3</span>
                  How We Share Your Information
                </h3>
                <div className="space-y-6">
                  <div className="border-l-4 border-blue-600 dark:border-blue-400 pl-6">
                    <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3.1 Service Providers</h4>
                    <p className="text-gray-700 dark:text-gray-300">With trusted third-party providers who assist in hosting, payment processing, and technical support.</p>
                  </div>
                  <div className="border-l-4 border-purple-600 dark:border-purple-400 pl-6">
                    <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3.2 Legal Obligations</h4>
                    <p className="text-gray-700 dark:text-gray-300">To comply with laws, regulations, or legal requests.</p>
                  </div>
                  <div className="border-l-4 border-blue-600 dark:border-blue-400 pl-6">
                    <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3.3 Business Transfers</h4>
                    <p className="text-gray-700 dark:text-gray-300">In the event of a merger, acquisition, or sale of assets, your data may be transferred to the new entity.</p>
                  </div>
                  <div className="border-l-4 border-purple-600 dark:border-purple-400 pl-6">
                    <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3.4 Creator-Business Platform (MEDITRON)</h4>
                    <p className="text-gray-700 dark:text-gray-300">When you participate in campaigns, relevant details (e.g., niche, follower count, engagement metrics) may be shared with businesses or creators as necessary to facilitate collaboration.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 4: Data Storage and Security */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-600/5 to-gray-700/5 dark:from-gray-400/3 dark:to-gray-500/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">4</span>
                  Data Storage and Security
                </h3>
                <ul className="text-gray-700 dark:text-gray-300 space-y-3 text-lg">
                  <li>Your data is stored on secure servers with encryption and access controls.</li>
                  <li>We retain your information only as long as necessary to fulfill our services or comply with legal obligations.</li>
                  <li>While we strive to protect your data, no system is 100% secure, and we cannot guarantee absolute security.</li>
                </ul>
              </div>
            </section>

            {/* Section 5: Your Rights */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 to-blue-600/5 dark:from-purple-400/3 dark:to-blue-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-purple-600 to-blue-700 dark:from-purple-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">5</span>
                  Your Rights
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-black p-4 rounded-lg border border-gray-300 dark:border-gray-600">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Access and Portability</h4>
                    <p className="text-gray-700 dark:text-gray-300 text-sm">Request a copy of your data.</p>
                  </div>
                  <div className="bg-white dark:bg-black p-4 rounded-lg border border-gray-300 dark:border-gray-600">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Correction</h4>
                    <p className="text-gray-700 dark:text-gray-300 text-sm">Update or correct inaccurate information.</p>
                  </div>
                  <div className="bg-white dark:bg-black p-4 rounded-lg border border-gray-300 dark:border-gray-600">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Deletion</h4>
                    <p className="text-gray-700 dark:text-gray-300 text-sm">Request the deletion of your data, subject to legal requirements.</p>
                  </div>
                  <div className="bg-white dark:bg-black p-4 rounded-lg border border-gray-300 dark:border-gray-600">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Objection</h4>
                    <p className="text-gray-700 dark:text-gray-300 text-sm">Opt-out of certain uses of your data, such as marketing emails.</p>
                  </div>
                </div>
                <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900 dark:to-purple-900 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-gray-800 dark:text-gray-200">
                    To exercise these rights, contact us at {" "}
                    <a href="mailto:support@insturix.com" className="font-semibold text-black dark:text-white hover:underline">
                      support@insturix.com
                    </a>
                  </p>
                </div>
              </div>
            </section>

            {/* Section 6: Cookies and Tracking Technologies */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-600/5 to-gray-700/5 dark:from-gray-400/3 dark:to-gray-500/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">6</span>
                  Cookies and Tracking Technologies
                </h3>
                <ul className="text-gray-700 dark:text-gray-300 space-y-3 text-lg">
                  <li>Enhance your experience on our website and services.</li>
                  <li>Analyze user behavior to improve our offerings.</li>
                  <li>Track campaign performance for creators and businesses.</li>
                </ul>
                <p className="text-gray-700 dark:text-gray-300 mt-2">You can manage cookie preferences in your browser settings.</p>
              </div>
            </section>

            {/* Section 7: Third-Party Links */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 to-blue-600/5 dark:from-purple-400/3 dark:to-blue-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-purple-600 to-blue-700 dark:from-purple-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">7</span>
                  Third-Party Links
                </h3>
                <p className="text-gray-700 dark:text-gray-300">
                  Our services may include links to third-party websites. We are not responsible for their privacy practices and encourage you to review their policies.
                </p>
              </div>
            </section>

            {/* Section 8: Children&apos;s Privacy */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-purple-600/5 dark:from-blue-400/3 dark:to-purple-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-blue-600 to-purple-700 dark:from-blue-500 dark:to-purple-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">8</span>
                  Children&apos;s Privacy
                </h3>
                <p className="text-gray-700 dark:text-gray-300">
                  Our services are not intended for individuals under 13 years of age. We do not knowingly collect personal data from children.
                </p>
              </div>
            </section>

            {/* Section 9: Changes to This Privacy Policy */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-600/5 to-gray-700/5 dark:from-gray-400/3 dark:to-gray-500/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">9</span>
                  Changes to This Privacy Policy
                </h3>
                <p className="text-gray-700 dark:text-gray-300">
                  We may update this policy to reflect changes in our practices, services, or legal requirements. Significant changes will be communicated via email or our website.
                </p>
              </div>
            </section>

            {/* Section 10: Contact Us */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 to-blue-600/5 dark:from-purple-400/3 dark:to-blue-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-purple-600 to-blue-700 dark:from-purple-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">10</span>
                  Contact Us
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-4">For questions or concerns about this Privacy Policy, contact us at:</p>
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900 dark:to-purple-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <p className="text-gray-800 dark:text-gray-200">
                    Email: {" "}
                    <a href="mailto:support@insturix.com" className="font-semibold hover:underline text-black dark:text-white">
                      support@insturix.com
                    </a>
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* Footer note */}
          <div className="text-center mt-16 pt-10 border-t border-gray-300/50 dark:border-gray-600/50">
            <div className="max-w-3xl mx-auto">
              <div className="bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-8 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-500 rounded-2xl flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-gray-600 dark:text-gray-300 text-lg font-medium leading-relaxed">
                  By using INSTURIX, you acknowledge that you have read, understood, and agree to be bound by this Privacy Policy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
