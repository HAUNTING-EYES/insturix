import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function CancellationPolicy() {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-slate-100 dark:from-gray-900 dark:via-blue-950/30 dark:to-slate-900 transition-all duration-500 font-sans">
        <div className="container mx-auto px-4 py-20 max-w-5xl">
          {/* Header Section */}
          <div className="text-center mb-16 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 dark:from-blue-400/10 dark:to-purple-400/10 blur-3xl -z-10"></div>
            <h1 className="text-5xl md:text-7xl font-extrabold bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 dark:from-blue-400 dark:via-purple-400 dark:to-blue-300 bg-clip-text text-transparent mb-6 tracking-tight">
              Cancellation & Refund Policy
            </h1>
            <div className="inline-flex items-center bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white px-6 py-3 rounded-full text-sm font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
              <svg
                className="w-4 h-4 mr-2"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                  clipRule="evenodd"
                />
              </svg>
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
                    Transparency and Integrity
                  </h3>
                  <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                    At <span className="font-bold text-black dark:text-white">Insturix</span>, transparency and integrity are at the core of our policies. As we provide AI-driven digital services and tools, this cancellation policy has been drafted to ensure fairness while protecting the integrity of our operations and digital infrastructure.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Policy Sections */}
          <div className="space-y-8">
            {/* Section 1: General Policy Overview */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-600/5 to-gray-700/5 dark:from-gray-400/3 dark:to-gray-500/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">1</span>
                  General Policy Overview
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  Insturix offers Platform-as-a-service (PaaS) and AI-powered solutions. Due to the automated and digital nature of our Platform, cancellations are only applicable to ongoing subscription plans, not on individual actions or executed commands.
                </p>
              </div>
            </section>

            {/* Section 2: Cancellation of Subscription Plans */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 to-blue-600/5 dark:from-purple-400/3 dark:to-blue-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-purple-600 to-blue-700 dark:from-purple-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">2</span>
                  Cancellation of Subscription Plans
                </h3>
                <ul className="list-disc pl-20 text-gray-700 dark:text-gray-300 space-y-3 text-lg">
                  <li>Customers have the right to cancel their active subscription plans at any time via their account dashboard.</li>
                  <li>Upon cancellation, the subscription remains active until the end of the billing cycle as outlined in the original plan description.</li>
                  <li>No refunds or partial refunds will be issued for unused days in the active period.</li>
                  <li>All plan-based services and access rights will be automatically terminated at the end of the current billing period.</li>
                  <li>Users will receive a confirmation email upon successful cancellation.</li>
                </ul>
              </div>
            </section>

            {/* Section 3: Cancellation of Commands, Orders, or Executed Services */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-purple-600/5 dark:from-blue-400/3 dark:to-purple-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-blue-600 to-purple-700 dark:from-blue-500 dark:to-purple-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">3</span>
                  Cancellation of Commands, Orders, or Executed Services
                </h3>
                <ul className="list-disc pl-20 text-gray-700 dark:text-gray-300 space-y-3 text-lg">
                  <li>Once a command is executed (e.g., an AI request, project generation, code execution, business report generation, video editing job, etc.), it is final and irreversible.</li>
                  <li>This includes actions initiated on platforms such as Editron, ThinkForge, Musitron, Alyzitron, or any other service offered by Insturix.</li>
                  <li>No cancellations, pauses, or amendments are permitted after an order or command has been submitted, as our systems allocate computational and human resources in real time.</li>
                </ul>
              </div>
            </section>

            {/* Section 4: Automated Services & No Manual Interventions */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-600/5 to-gray-700/5 dark:from-gray-400/3 dark:to-gray-500/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">4</span>
                  Automated Services & No Manual Interventions
                </h3>
                <ul className="list-disc pl-20 text-gray-700 dark:text-gray-300 space-y-3 text-lg">
                  <li>Many Insturix tools operate in real time with minimal human intervention.</li>
                  <li>Once a service is triggered, backend systems and AI modules begin immediate processing.</li>
                  <li>For this reason, manual override or cancellation requests cannot be accommodated after initiation.</li>
                </ul>
              </div>
            </section>

            {/* Section 5: Termination by Insturix */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 to-blue-600/5 dark:from-purple-400/3 dark:to-blue-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-purple-600 to-blue-700 dark:from-purple-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">5</span>
                  Termination by Insturix
                </h3>
                <ul className="list-disc pl-20 text-gray-700 dark:text-gray-300 space-y-3 text-lg">
                  <li>We reserve the right to cancel a user’s access or subscription at our sole discretion in the following cases:
                    <ul className="list-disc pl-8 mt-2 space-y-1 text-base">
                      <li>Violation of our Terms of Use</li>
                      <li>Fraudulent behavior or misuse of AI systems</li>
                      <li>Unauthorized commercial redistribution of our services</li>
                      <li>Use of our tools for harmful or unethical purposes</li>
                    </ul>
                  </li>
                  <li>In such cases, no refund or compensation will be provided.</li>
                </ul>
              </div>
            </section>

            {/* Section 6: How to Cancel a Plan */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-600/5 to-gray-700/5 dark:from-gray-400/3 dark:to-gray-500/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg">6</span>
                  How to Cancel a Plan
                </h3>
                <ol className="list-decimal pl-20 text-gray-700 dark:text-gray-300 space-y-3 text-lg">
                  <li>Go to your Insturix Account</li>
                  <li>Navigate to “Manage Plan” &gt; “Cancel Subscription”</li>
                  <li>Follow the confirmation steps</li>
                  <li>A confirmation email will be sent immediately</li>
                </ol>
                <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900 dark:to-purple-900 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-gray-800 dark:text-gray-200">
                    For any cancellation support, contact us at {" "}
                    <a href="mailto:support@insturix.com" className="font-semibold text-black dark:text-white hover:underline">
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
                  By using Insturix, you acknowledge that you have read, understood, and agree to be bound by this Cancellation & Refund Policy.
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