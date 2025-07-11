import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function Terms() {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-slate-100 dark:from-gray-900 dark:via-blue-950/30 dark:to-slate-900 transition-all duration-500">
        <div className="container mx-auto px-4 py-20 max-w-5xl">
          {/* Header Section */}
          <div className="text-center mb-16 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 dark:from-blue-400/10 dark:to-purple-400/10 blur-3xl -z-10"></div>
            <h1 className="text-5xl md:text-7xl font-extrabold bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 dark:from-blue-400 dark:via-purple-400 dark:to-blue-300 bg-clip-text text-transparent mb-6 tracking-tight">
              INSTURIX
            </h1>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-8 tracking-wide">
              Terms and Conditions
            </h2>
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
              Last Updated: April 10, 2025
            </div>
          </div>

          {/* Welcome Section */}
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
                  <h3 className="text-xl font-bold text-black dark:text-white mb-3">
                    Welcome to INSTURIX!
                  </h3>
                  <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                    These Terms and Conditions (&quot;T&Cs&quot;) govern your
                    access to and use of the INSTURIX website and the services
                    provided by INSTURIX (&quot;we&quot;, &quot;us&quot;, or
                    &quot;our&quot;). By accessing or using the Website, you
                    agree to be bound by these T&Cs.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Terms Content */}
          <div className="space-y-8">
            {/* Section 1 - Blue */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-blue-700/5 dark:from-blue-400/3 dark:to-blue-500/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-blue-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    1
                  </span>
                  <span className="bg-gradient-to-r from-blue-600 to-blue-800 dark:from-blue-400 dark:to-blue-300 bg-clip-text text-transparent">
                    Acceptance of Terms
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  By using this Website, you accept and agree to comply with
                  these T&Cs. If you do not agree to these T&Cs, please do not
                  use the Website.
                </p>
              </div>
            </section>

            {/* Section 2 - Green */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-green-600/5 to-emerald-600/5 dark:from-green-400/3 dark:to-emerald-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-green-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-green-600 to-green-700 dark:from-green-500 dark:to-green-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    2
                  </span>
                  <span className="bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent">
                    Services Overview
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  We provide digital protection policies and SaaS products for
                  content creators on platforms such as Instagram.
                </p>
              </div>
            </section>

            {/* Section 3 - Purple */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 to-violet-600/5 dark:from-purple-400/3 dark:to-violet-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-purple-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-purple-600 to-purple-700 dark:from-purple-500 dark:to-purple-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    3
                  </span>
                  <span className="bg-gradient-to-r from-purple-600 to-violet-600 dark:from-purple-400 dark:to-violet-400 bg-clip-text text-transparent">
                    Eligibility
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  By using our Website, you confirm that you are at least 18
                  years old and have the legal capacity to enter into binding
                  agreements.
                </p>
              </div>
            </section>

            {/* Section 4 - Indigo */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/5 to-blue-600/5 dark:from-indigo-400/3 dark:to-blue-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-indigo-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-indigo-600 to-indigo-700 dark:from-indigo-500 dark:to-indigo-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    4
                  </span>
                  <span className="bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-400 dark:to-blue-400 bg-clip-text text-transparent">
                    Protection Policy Terms
                  </span>
                </h3>
                <div className="pl-16">
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg mb-6">
                    For clients enrolled in our Protection Policy:
                  </p>
                  <ul className="space-y-4">
                    <li className="flex items-start group/item">
                      <span className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 dark:from-indigo-400 dark:to-blue-500 text-white rounded-xl flex items-center justify-center text-sm font-bold mr-4 group-hover/item:scale-110 transition-transform duration-200">
                        •
                      </span>
                      <div>
                        <strong className="text-gray-900 dark:text-gray-100">
                          Coverage:
                        </strong>
                        <span className="text-gray-700 dark:text-gray-300 ml-2">
                          Detailed information on the protection services,
                          coverage, and limitations is outlined in the
                          Protection Policy Document.
                        </span>
                      </div>
                    </li>
                    <li className="flex items-start group/item">
                      <span className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 dark:from-indigo-400 dark:to-blue-500 text-white rounded-xl flex items-center justify-center text-sm font-bold mr-4 group-hover/item:scale-110 transition-transform duration-200">
                        •
                      </span>
                      <div>
                        <strong className="text-gray-900 dark:text-gray-100">
                          Exclusions:
                        </strong>
                        <span className="text-gray-700 dark:text-gray-300 ml-2">
                          Certain cases, as detailed in the Protection Policy
                          Document, are not covered.
                        </span>
                      </div>
                    </li>
                    <li className="flex items-start group/item">
                      <span className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 dark:from-indigo-400 dark:to-blue-500 text-white rounded-xl flex items-center justify-center text-sm font-bold mr-4 group-hover/item:scale-110 transition-transform duration-200">
                        •
                      </span>
                      <div>
                        <strong className="text-gray-900 dark:text-gray-100">
                          Non-Insurance Clause:
                        </strong>
                        <span className="text-gray-700 dark:text-gray-300 ml-2">
                          Our Protection Policy is not an insurance policy. It
                          provides specialized support and services without
                          conferring legal insurance status.
                        </span>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 5 - Emerald */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/5 to-teal-600/5 dark:from-emerald-400/3 dark:to-teal-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-emerald-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-emerald-600 to-emerald-700 dark:from-emerald-500 dark:to-emerald-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    5
                  </span>
                  <span className="bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                    User Responsibilities
                  </span>
                </h3>
                <div className="pl-16">
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg mb-6">
                    By using this Website and/or subscribing to our Protection
                    Policy, you agree to:
                  </p>
                  <ul className="space-y-4">
                    <li className="flex items-start group/item">
                      <span className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-emerald-400 dark:to-teal-500 text-white rounded-xl flex items-center justify-center text-sm font-bold mr-4 group-hover/item:scale-110 transition-transform duration-200">
                        •
                      </span>
                      <span className="text-gray-700 dark:text-gray-300">
                        Provide accurate, current, and complete information as
                        required.
                      </span>
                    </li>
                    <li className="flex items-start group/item">
                      <span className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-emerald-400 dark:to-teal-500 text-white rounded-xl flex items-center justify-center text-sm font-bold mr-4 group-hover/item:scale-110 transition-transform duration-200">
                        •
                      </span>
                      <span className="text-gray-700 dark:text-gray-300">
                        Maintain the confidentiality of your account credentials
                        and notify us immediately of any unauthorized use.
                      </span>
                    </li>
                    <li className="flex items-start group/item">
                      <span className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-emerald-400 dark:to-teal-500 text-white rounded-xl flex items-center justify-center text-sm font-bold mr-4 group-hover/item:scale-110 transition-transform duration-200">
                        •
                      </span>
                      <span className="text-gray-700 dark:text-gray-300">
                        Not engage in activities that violate these T&Cs, any
                        applicable law, or the rights of others.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 6 - Orange */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-600/5 to-amber-600/5 dark:from-orange-400/3 dark:to-amber-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-orange-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-orange-600 to-orange-700 dark:from-orange-500 dark:to-orange-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    6
                  </span>
                  <span className="bg-gradient-to-r from-orange-600 to-amber-600 dark:from-orange-400 dark:to-amber-400 bg-clip-text text-transparent">
                    Account Registration and Security
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  To access certain features, you may be required to create an
                  account. You agree to provide accurate and complete
                  registration information, update your information as
                  necessary, and maintain the security of your account and
                  notify us of any unauthorized access.
                </p>
              </div>
            </section>

            {/* Section 7 - Red */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-red-600/5 to-rose-600/5 dark:from-red-400/3 dark:to-rose-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-red-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-red-600 to-red-700 dark:from-red-500 dark:to-red-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    7
                  </span>
                  <span className="bg-gradient-to-r from-red-600 to-rose-600 dark:from-red-400 dark:to-rose-400 bg-clip-text text-transparent">
                    Payment and Fees
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  Fees for our services are detailed on the Website and in the
                  Protection Policy Document. Payments are due in full upon
                  enrolling in the policy. All fees are non-refundable except as
                  specified in our Refund Policy. We reserve the right to modify
                  fees at any time, with prior notice being posted on the
                  Website or sent by email.
                </p>
              </div>
            </section>

            {/* Section 8 - Yellow */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-600/5 to-amber-600/5 dark:from-yellow-400/3 dark:to-amber-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-yellow-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-yellow-600 to-yellow-700 dark:from-yellow-500 dark:to-yellow-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    8
                  </span>
                  <span className="bg-gradient-to-r from-yellow-600 to-amber-600 dark:from-yellow-400 dark:to-amber-400 bg-clip-text text-transparent">
                    Disclaimer of Warranties
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  The Website and all content and services are provided on an
                  &quot;AS IS&quot; and &quot;AS AVAILABLE& quot; basis. We
                  disclaim all warranties, express or implied, including but not
                  limited to the accuracy, completeness, or suitability of
                  information on the Website. We do not guarantee uninterrupted,
                  error-free, or virus-free access to the Website.
                </p>
              </div>
            </section>

            {/* Section 9 - Pink */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-pink-600/5 to-rose-600/5 dark:from-pink-400/3 dark:to-rose-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-pink-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-pink-600 to-pink-700 dark:from-pink-500 dark:to-pink-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    9
                  </span>
                  <span className="bg-gradient-to-r from-pink-600 to-rose-600 dark:from-pink-400 dark:to-rose-400 bg-clip-text text-transparent">
                    Limitation of Liability
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  To the fullest extent permitted by law: INSTURIX and its
                  affiliates shall not be liable for any direct, indirect,
                  incidental, or consequential damages, including but not
                  limited to loss of profits, data, or use, arising from the use
                  of the Website or our services. Our total liability for any
                  claims relating to the use of our services shall be limited to
                  the amount paid by you for the services in the preceding 6
                  months.
                </p>
              </div>
            </section>

            {/* Section 10 - Violet */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 to-purple-600/5 dark:from-violet-400/3 dark:to-purple-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-violet-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-violet-600 to-violet-700 dark:from-violet-500 dark:to-violet-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    10
                  </span>
                  <span className="bg-gradient-to-r from-violet-600 to-purple-600 dark:from-violet-400 dark:to-purple-400 bg-clip-text text-transparent">
                    Intellectual Property Rights
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  All content on the Website, including but not limited to text,
                  images, logos, and software, is owned by INSTURIX or licensed
                  to us. You are granted a limited, non-exclusive,
                  non-transferable right to access and use the Website for
                  personal and non-commercial purposes. You may not reproduce,
                  distribute, or create derivative works without our express
                  written consent.
                </p>
              </div>
            </section>

            {/* Section 11 - Cyan */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/5 to-teal-600/5 dark:from-cyan-400/3 dark:to-teal-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-cyan-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-cyan-600 to-cyan-700 dark:from-cyan-500 dark:to-cyan-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    11
                  </span>
                  <span className="bg-gradient-to-r from-cyan-600 to-teal-600 dark:from-cyan-400 dark:to-teal-400 bg-clip-text text-transparent">
                    Prohibited Conduct
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  You agree not to: engage in any form of data scraping, data
                  extraction, or similar activity; use the Website to infringe
                  on the rights of others or promote illegal activities; or
                  bypass or attempt to bypass any security measures on the
                  Website.
                </p>
              </div>
            </section>

            {/* Section 12 - Lime */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-lime-600/5 to-green-600/5 dark:from-lime-400/3 dark:to-green-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-lime-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-lime-600 to-lime-700 dark:from-lime-500 dark:to-lime-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    12
                  </span>
                  <span className="bg-gradient-to-r from-lime-600 to-green-600 dark:from-lime-400 dark:to-green-400 bg-clip-text text-transparent">
                    Privacy Policy
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  Our Privacy Policy outlines how we collect, use, and protect
                  your personal information. By using the Website, you agree to
                  the practices described in our Privacy Policy.
                </p>
              </div>
            </section>

            {/* Section 13 - Amber */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-600/5 to-orange-600/5 dark:from-amber-400/3 dark:to-orange-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-amber-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-amber-600 to-amber-700 dark:from-amber-500 dark:to-amber-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    13
                  </span>
                  <span className="bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
                    Third-Party Links
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  Our Website may contain links to third-party websites or
                  resources. We are not responsible for the availability or
                  accuracy of these resources or their content.
                </p>
              </div>
            </section>

            {/* Section 14 - Rose */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-rose-600/5 to-pink-600/5 dark:from-rose-400/3 dark:to-pink-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-rose-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-rose-600 to-rose-700 dark:from-rose-500 dark:to-rose-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    14
                  </span>
                  <span className="bg-gradient-to-r from-rose-600 to-pink-600 dark:from-rose-400 dark:to-pink-400 bg-clip-text text-transparent">
                    Modification of T&Cs
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  We reserve the right to modify these T&Cs at any time. Changes
                  will be posted on the Website and, where feasible, notified to
                  users via email. Continued use of the Website after changes
                  are made constitutes acceptance of the new T&Cs.
                </p>
              </div>
            </section>

            {/* Section 15 - Fuchsia */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-600/5 to-violet-600/5 dark:from-fuchsia-400/3 dark:to-violet-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-fuchsia-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-fuchsia-600 to-fuchsia-700 dark:from-fuchsia-500 dark:to-fuchsia-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    15
                  </span>
                  <span className="bg-gradient-to-r from-fuchsia-600 to-violet-600 dark:from-fuchsia-400 dark:to-violet-400 bg-clip-text text-transparent">
                    Termination of Access
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  We reserve the right to suspend or terminate your access to
                  the Website and services at our discretion, including for any
                  violation of these T&Cs.
                </p>
              </div>
            </section>

            {/* Section 16 - Sky */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-sky-600/5 to-blue-600/5 dark:from-sky-400/3 dark:to-blue-400/3 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl shadow-lg dark:shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl dark:hover:shadow-sky-500/20 transition-all duration-500">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center group">
                  <span className="bg-gradient-to-br from-sky-600 to-sky-700 dark:from-sky-500 dark:to-sky-600 text-white rounded-2xl w-12 h-12 flex items-center justify-center text-lg font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    16
                  </span>
                  <span className="bg-gradient-to-r from-sky-600 to-blue-600 dark:from-sky-400 dark:to-blue-400 bg-clip-text text-transparent">
                    Governing Law and Dispute Resolution
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg pl-16">
                  These T&Cs and any disputes arising from them shall be
                  governed by and construed in accordance with the laws of
                  India. Any disputes shall be resolved through arbitration in
                  Delhi, India, in accordance with Indian Arbitration and
                  Conciliation laws.
                </p>
              </div>
            </section>

            {/* Section 17 - Contact Information */}
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 dark:from-blue-400/10 dark:to-purple-400/10 rounded-3xl blur-2xl group-hover:blur-3xl transition-all duration-500"></div>
              <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-purple-700 dark:from-blue-500 dark:via-blue-600 dark:to-purple-600 rounded-3xl shadow-2xl p-10 text-white overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent dark:from-white/5 dark:to-transparent"></div>
                <div className="relative z-10">
                  <h3 className="text-3xl font-bold mb-6 flex items-center group">
                    <span className="bg-white/20 dark:bg-white/30 backdrop-blur-sm text-white rounded-2xl w-14 h-14 flex items-center justify-center text-xl font-bold mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                      17
                    </span>
                    Contact Information
                  </h3>
                  <p className="mb-8 text-xl leading-relaxed text-blue-50 dark:text-blue-100">
                    If you have any questions about these T&Cs, please contact
                    us at:
                  </p>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <p className="font-bold text-2xl text-white">INSTURIX</p>
                      <div className="space-y-3">
                        <div className="flex items-center text-blue-100 dark:text-blue-200 hover:text-white transition-colors duration-200">
                          <div className="w-10 h-10 bg-white/20 dark:bg-white/30 rounded-xl flex items-center justify-center mr-4">
                            <svg
                              className="w-5 h-5"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                            </svg>
                          </div>
                          +91 92201 21372
                        </div>
                        <div className="flex items-center text-blue-100 dark:text-blue-200 hover:text-white transition-colors duration-200">
                          <div className="w-10 h-10 bg-white/20 dark:bg-white/30 rounded-xl flex items-center justify-center mr-4">
                            <svg
                              className="w-5 h-5"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                            </svg>
                          </div>
                          support@insturix.com
                        </div>
                        <div className="flex items-center text-blue-100 dark:text-blue-200 hover:text-white transition-colors duration-200">
                          <div className="w-10 h-10 bg-white/20 dark:bg-white/30 rounded-xl flex items-center justify-center mr-4">
                            <svg
                              className="w-5 h-5"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.148.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                          www.insturix.com
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-center">
                      <div className="w-32 h-32 bg-white/20 dark:bg-white/30 backdrop-blur-sm rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <svg
                          className="w-16 h-16 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
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
                  By using INSTURIX, you acknowledge that you have read,
                  understood, and agree to be bound by these Terms and
                  Conditions.
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
