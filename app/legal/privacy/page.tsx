import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function Privacy() {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
        <div className="container mx-auto px-4 py-16">
          {/* Header Section */}
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-black dark:text-white mb-4">
              Privacy Policy
            </h1>
            <div className="w-24 h-1 bg-black dark:bg-white mx-auto mb-6"></div>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Effective Date: <span className="font-semibold text-black dark:text-white">10 April 2025</span>
            </p>
          </div>

          {/* Introduction */}
          <div className="max-w-4xl mx-auto mb-12">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 border border-gray-200 dark:border-gray-700">
              <p className="text-lg leading-relaxed text-gray-800 dark:text-gray-200">
                Welcome to <span className="font-bold text-black dark:text-white">INSTURIX</span>. We are committed to protecting your privacy and ensuring the security of your personal data. This Privacy Policy explains how we collect, use, disclose, and protect your information when you use our services, including the Protection Policy (Shield), Content Analyzer (Alyzitron), AI Video Editor (Editron), Creator-Business Platform (Meditron), and AI Music Gen (Musitron).
              </p>
              <p className="text-lg leading-relaxed text-gray-800 dark:text-gray-200 mt-4">
                By accessing or using our services, you agree to the terms outlined in this Privacy Policy.
              </p>
            </div>
          </div>

          {/* Main Content */}
          <div className="max-w-4xl mx-auto space-y-12">
            
            {/* Section 1: Information We Collect */}
            <section className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-3xl font-bold text-black dark:text-white mb-6 flex items-center">
                <span className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center text-lg font-bold mr-4">1</span>
                Information We Collect
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-6">We collect the following types of information:</p>
              
              <div className="space-y-6">
                <div className="border-l-4 border-black dark:border-white pl-6">
                  <h3 className="text-xl font-semibold text-black dark:text-white mb-3">1.1 Personal Information</h3>
                  <ul className="text-gray-700 dark:text-gray-300 space-y-2">
                    <li>• Name, email address, phone number, and other contact details</li>
                    <li>• Social media account details (e.g., usernames, follower count, engagement metrics)</li>
                    <li>• Payment information for subscription-based services</li>
                  </ul>
                </div>

                <div className="border-l-4 border-gray-500 dark:border-gray-400 pl-6">
                  <h3 className="text-xl font-semibold text-black dark:text-white mb-3">1.2 Uploaded Content</h3>
                  <ul className="text-gray-700 dark:text-gray-300 space-y-2">
                    <li>• Media files, captions, or other content uploaded for analysis, editing, or promotional purposes</li>
                    <li>• Business promotional material submitted for campaigns</li>
                  </ul>
                </div>

                <div className="border-l-4 border-black dark:border-white pl-6">
                  <h3 className="text-xl font-semibold text-black dark:text-white mb-3">1.3 Usage Data</h3>
                  <ul className="text-gray-700 dark:text-gray-300 space-y-2">
                    <li>• Information about how you use our services (e.g., login times, feature usage, search queries)</li>
                    <li>• Device information, including IP address, browser type, and operating system</li>
                  </ul>
                </div>

                <div className="border-l-4 border-gray-500 dark:border-gray-400 pl-6">
                  <h3 className="text-xl font-semibold text-black dark:text-white mb-3">1.4 Third-Party Information</h3>
                  <ul className="text-gray-700 dark:text-gray-300 space-y-2">
                    <li>• Publicly available information from social media platforms for account analysis and verification</li>
                    <li>• Business details for creating and managing campaigns on the Creator-Business Platform</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 2: How We Use Your Information */}
            <section className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-3xl font-bold text-black dark:text-white mb-6 flex items-center">
                <span className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center text-lg font-bold mr-4">2</span>
                How We Use Your Information
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-6">We use your information to:</p>
              <ul className="text-gray-700 dark:text-gray-300 space-y-3">
                <li>• Provide and improve our services, including content analysis, account evaluation, video editing, and creator-business matchmaking</li>
                <li>• Personalize your experience based on your preferences and history</li>
                <li>• Facilitate connections between creators and businesses for promotional campaigns</li>
                <li>• Communicate with you about updates, subscriptions, support, and promotional opportunities</li>
                <li>• Process payments, manage billing, and issue refunds when applicable</li>
                <li>• Comply with legal obligations and prevent fraud or misuse</li>
              </ul>
            </section>

            {/* Section 3: How We Share Your Information */}
            <section className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-3xl font-bold text-black dark:text-white mb-6 flex items-center">
                <span className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center text-lg font-bold mr-4">3</span>
                How We Share Your Information
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                <span className="font-semibold text-black dark:text-white">We do not sell your personal data.</span> We may share your information in the following scenarios:
              </p>
              
              <div className="space-y-6">
                <div className="border-l-4 border-black dark:border-white pl-6">
                  <h3 className="text-xl font-semibold text-black dark:text-white mb-3">3.1 Service Providers</h3>
                  <p className="text-gray-700 dark:text-gray-300">With trusted third-party providers who assist in hosting, payment processing, technical support, or campaign management.</p>
                </div>

                <div className="border-l-4 border-gray-500 dark:border-gray-400 pl-6">
                  <h3 className="text-xl font-semibold text-black dark:text-white mb-3">3.2 Legal Obligations</h3>
                  <p className="text-gray-700 dark:text-gray-300">To comply with laws, regulations, or legal requests.</p>
                </div>

                <div className="border-l-4 border-black dark:border-white pl-6">
                  <h3 className="text-xl font-semibold text-black dark:text-white mb-3">3.3 Business Transfers</h3>
                  <p className="text-gray-700 dark:text-gray-300">In the event of a merger, acquisition, or sale of assets, your data may be transferred to the new entity.</p>
                </div>

                <div className="border-l-4 border-gray-500 dark:border-gray-400 pl-6">
                  <h3 className="text-xl font-semibold text-black dark:text-white mb-3">3.4 Creator-Business Platform</h3>
                  <p className="text-gray-700 dark:text-gray-300">When you participate in campaigns, relevant details (e.g., niche, follower count, engagement metrics) may be shared with businesses or creators as necessary to facilitate collaboration.</p>
                </div>
              </div>
            </section>

            {/* Section 4: Data Storage and Security */}
            <section className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-3xl font-bold text-black dark:text-white mb-6 flex items-center">
                <span className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center text-lg font-bold mr-4">4</span>
                Data Storage and Security
              </h2>
              <div className="space-y-4 text-gray-700 dark:text-gray-300">
                <p>• Your data is stored on secure servers with encryption and access controls.</p>
                <p>• We retain your information only as long as necessary to fulfill our services or comply with legal obligations.</p>
                <p>• While we strive to protect your data, no system is 100% secure, and we cannot guarantee absolute security.</p>
              </div>
            </section>

            {/* Section 5: Your Rights */}
            <section className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-3xl font-bold text-black dark:text-white mb-6 flex items-center">
                <span className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center text-lg font-bold mr-4">5</span>
                Your Rights
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-6">You have the following rights regarding your data:</p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-black p-4 rounded-lg border border-gray-300 dark:border-gray-600">
                  <h4 className="font-semibold text-black dark:text-white mb-2">Access and Portability</h4>
                  <p className="text-gray-700 dark:text-gray-300 text-sm">Request a copy of your data</p>
                </div>
                <div className="bg-white dark:bg-black p-4 rounded-lg border border-gray-300 dark:border-gray-600">
                  <h4 className="font-semibold text-black dark:text-white mb-2">Correction</h4>
                  <p className="text-gray-700 dark:text-gray-300 text-sm">Update or correct inaccurate information</p>
                </div>
                <div className="bg-white dark:bg-black p-4 rounded-lg border border-gray-300 dark:border-gray-600">
                  <h4 className="font-semibold text-black dark:text-white mb-2">Deletion</h4>
                  <p className="text-gray-700 dark:text-gray-300 text-sm">Request the deletion of your data, subject to legal requirements</p>
                </div>
                <div className="bg-white dark:bg-black p-4 rounded-lg border border-gray-300 dark:border-gray-600">
                  <h4 className="font-semibold text-black dark:text-white mb-2">Objection</h4>
                  <p className="text-gray-700 dark:text-gray-300 text-sm">Opt-out of certain uses of your data, such as marketing emails</p>
                </div>
              </div>
              <div className="mt-6 p-4 bg-white dark:bg-black rounded-lg border border-gray-300 dark:border-gray-600">
                <p className="text-gray-800 dark:text-gray-200">
                  To exercise these rights, contact us at{" "}
                  <a href="mailto:support@insturix.com" className="font-semibold text-black dark:text-white hover:underline">
                    support@insturix.com
                  </a>
                </p>
              </div>
            </section>

            {/* Remaining Sections */}
            <section className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-3xl font-bold text-black dark:text-white mb-6 flex items-center">
                <span className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center text-lg font-bold mr-4">6</span>
                Cookies and Tracking Technologies
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">We may use cookies and similar technologies to:</p>
              <ul className="text-gray-700 dark:text-gray-300 space-y-2 mb-4">
                <li>• Enhance your experience on our website and services</li>
                <li>• Analyze user behavior to improve our offerings</li>
                <li>• Track campaign performance for creators and businesses</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300">You can manage cookie preferences in your browser settings.</p>
            </section>

            <section className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-3xl font-bold text-black dark:text-white mb-6 flex items-center">
                <span className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center text-lg font-bold mr-4">7</span>
                Third-Party Links
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Our services may include links to third-party websites. We are not responsible for their privacy practices and encourage you to review their policies.
              </p>
            </section>

            <section className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-3xl font-bold text-black dark:text-white mb-6 flex items-center">
                <span className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center text-lg font-bold mr-4">8</span>
                Children&apos;s Privacy
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Our services are not intended for individuals under 13 years of age. We do not knowingly collect personal data from children.
              </p>
            </section>

            <section className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-3xl font-bold text-black dark:text-white mb-6 flex items-center">
                <span className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center text-lg font-bold mr-4">9</span>
                Changes to This Privacy Policy
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                We may update this policy to reflect changes in our practices, services, or legal requirements. Significant changes will be communicated via email or our website.
              </p>
            </section>

            {/* Contact Section */}
            <section className="bg-black dark:bg-white rounded-lg p-8 text-white dark:text-black border border-gray-800 dark:border-gray-200">
              <h2 className="text-3xl font-bold mb-6 flex items-center">
                <span className="w-8 h-8 bg-white dark:bg-black text-black dark:text-white rounded-full flex items-center justify-center text-lg font-bold mr-4">10</span>
                Contact Us
              </h2>
              <p className="text-gray-300 dark:text-gray-700 mb-4">For questions or concerns about this Privacy Policy, contact us at:</p>
              <div className="bg-gray-800 dark:bg-gray-100 rounded-lg p-4 border border-gray-700 dark:border-gray-300">
                <p className="text-white dark:text-black">
                  Email:{" "}
                  <a href="mailto:support@insturix.com" className="font-semibold hover:underline">
                    support@insturix.com
                  </a>
                </p>
              </div>
            </section>
          </div>

          {/* Last Updated Notice */}
          <div className="text-center mt-16 pt-8 border-t border-gray-300 dark:border-gray-600">
            <p className="text-gray-600 dark:text-gray-400">
              Last updated: 10 April 2025
            </p>
          </div>
        </div>
      </div>
      
      <Footer />
    </>
  );
}
