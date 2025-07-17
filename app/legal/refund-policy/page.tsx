import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function RefundPolicy() {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-slate-100 dark:from-gray-900 dark:via-blue-950/30 dark:to-slate-900 transition-all duration-500 font-sans">
        <div className="container mx-auto px-4 py-40 max-w-5xl">
          {/* Header Section */}
          <div className="text-center mb-16 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 dark:from-blue-400/10 dark:to-purple-400/10 blur-3xl -z-10"></div>
            <h1 className="text-5xl md:text-7xl font-extrabold bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 dark:from-blue-400 dark:via-purple-400 dark:to-blue-300 bg-clip-text text-transparent mb-10 tracking-tight">
              Refund Policy
            </h1>
            <div className="inline-flex items-center bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white px-6 py-3 rounded-full text-sm font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
              Effective Date: July 13, 2025
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
                    Refund Policy Overview
                  </h3>
                  <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                    Insturix provides advanced AI systems and digital services built on real-time infrastructure. Due to the automated nature of our offerings, refund eligibility is limited and subject to strict conditions.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Policy Sections */}
          <div className="space-y-8">
            {/* Section 1: Strict No-Refund Areas */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-600/5 to-gray-700/5 dark:from-gray-400/3 dark:to-gray-500/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">1</span>
                  Strict No-Refund Areas
                </h3>
                <ul className="list-disc pl-20 text-gray-700 dark:text-gray-300 space-y-3 text-lg">
                  <li>Executed commands and AI actions (e.g., code generations, AI-based video edits, business analytics, content scripts).</li>
                  <li>Partially used or fully used subscription periods.</li>
                  <li>Services consumed as part of bundled offerings or promotional packages.</li>
                  <li>Failure to cancel a subscription before renewal.</li>
                  <li>Dissatisfaction after usage without a provable technical error.</li>
                  <li>Buyer’s remorse or change of mind.</li>
                </ul>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16 mt-4">
                  Insturix's systems begin service execution instantly upon receiving commands, making reversals or rollbacks technically and operationally infeasible.
                </p>
              </div>
            </section>

            {/* Section 2: Refund Eligibility – Exception Cases */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 to-blue-600/5 dark:from-purple-400/3 dark:to-blue-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-purple-600 to-blue-700 dark:from-purple-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">2</span>
                  Refund Eligibility – Exception Cases
                </h3>
                <ul className="list-disc pl-20 text-gray-700 dark:text-gray-300 space-y-3 text-lg">
                  <li><span className="font-semibold">Technical Failure:</span> If a paid service fails to deliver due to a backend system issue not caused by the user.</li>
                  <li><span className="font-semibold">Duplicate Charges:</span> Verified duplicate payments on the same account within the same billing cycle.</li>
                  <li><span className="font-semibold">Payment Gateway Errors:</span> Accidental double charges due to gateway processing problems (with supporting documentation).</li>
                  <li><span className="font-semibold">Pre-execution Cancellation:</span> In rare cases where a manually placed custom order (not an automated command) is canceled within 2 hours and before service has begun.</li>
                </ul>
              </div>
            </section>

            {/* Section 3: Refund Request Process */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-purple-600/5 dark:from-blue-400/3 dark:to-purple-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-blue-600 to-purple-700 dark:from-blue-500 dark:to-purple-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">3</span>
                  Refund Request Process
                </h3>
                <ol className="list-decimal pl-20 text-gray-700 dark:text-gray-300 space-y-3 text-lg">
                  <li>Email <a href="mailto:support@insturix.com" className="font-semibold text-black dark:text-white hover:underline">support@insturix.com</a></li>
                  <li>Include:
                    <ul className="list-disc pl-8 mt-2 space-y-1 text-base">
                      <li>Full name and account email</li>
                      <li>Transaction ID(s)</li>
                      <li>Date of payment</li>
                      <li>Reason for request</li>
                      <li>Any applicable screenshots or logs</li>
                    </ul>
                  </li>
                </ol>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16 mt-4">
                  Our team will review all refund requests and respond within 5–7 business days. Approved refunds are typically processed within 7–10 business days, depending on your bank/payment provider.
                </p>
              </div>
            </section>

            {/* Section 4: Third-Party Payment Services */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-600/5 to-gray-700/5 dark:from-gray-400/3 dark:to-gray-500/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">4</span>
                  Third-Party Payment Services
                </h3>
                <ul className="list-disc pl-20 text-gray-700 dark:text-gray-300 space-y-3 text-lg">
                  <li>Insturix is not liable for delays caused by:</li>
                  <ul className="list-disc pl-8 mt-2 space-y-1 text-base">
                    <li>Bank processing times</li>
                    <li>Payment gateway disruptions</li>
                    <li>Currency conversion issues</li>
                  </ul>
                  <li>However, we will fully cooperate with users to facilitate resolution.</li>
                </ul>
              </div>
            </section>

            {/* Section 5: Final Clause */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 to-blue-600/5 dark:from-purple-400/3 dark:to-blue-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-purple-600 to-blue-700 dark:from-purple-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">5</span>
                  Final Clause
                </h3>
                <ul className="list-disc pl-20 text-gray-700 dark:text-gray-300 space-y-3 text-lg">
                  <li>All refund decisions are made at the sole discretion of Insturix and are considered final.</li>
                  <li>Abuse of refund policies may lead to account suspension or termination of account.</li>
                </ul>
              </div>
            </section>

            {/* Contact Section */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10 dark:from-blue-400/5 dark:to-purple-400/5 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-gradient-to-r from-blue-600/5 to-blue-700/5 dark:from-blue-400/3 dark:to-blue-500/3 rounded-3xl shadow-xl dark:shadow-2xl p-8 md:p-10 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-2xl dark:hover:shadow-blue-500/20 transition-all duration-500">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-500 rounded-2xl flex items-center justify-center">
                    <span className="text-2xl">📩</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                      Contact Information
                    </h3>
                    <ul className="text-lg text-gray-700 dark:text-gray-300 space-y-2">
                      <li>Support Email: <a href="mailto:support@insturix.com" className="font-semibold text-black dark:text-white hover:underline">support@insturix.com</a></li>
                      <li>Legal Queries: <a href="mailto:legal@insturix.com" className="font-semibold text-black dark:text-white hover:underline">legal@insturix.com</a></li>
                      <li>Website: <a href="https://www.insturix.com" className="font-semibold text-black dark:text-white hover:underline">www.insturix.com</a></li>
                    </ul>
                  </div>
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
                  By using Insturix, you acknowledge that you have read, understood, and agree to be bound by this Refund Policy.
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