"use client";

import { motion } from "framer-motion";
import Spotlight from "@/components/ui/Spotlight";
import {
  Shield,
  Lock,
  Users,
  Settings,
  Globe,
  CheckCircle2,
} from "lucide-react";

const securityFeatures = [
  {
    title: "Zero Data Retention",
    description: "No training on your data by Insturix or LLM providers. Your code stays private.",
    icon: Lock,
    color: "#10B981",
  },
  {
    title: "SAML-Based SSO",
    description: "Identity management with SAML-based SSO integration for secure user access.",
    icon: Users,
    color: "#3B82F6",
  },
  {
    title: "SCIM User Provisioning",
    description: "Easily create, update, and remove users and groups with SCIM integration.",
    icon: Settings,
    color: "#8B5CF6",
  },
  {
    title: "Centralized Security Controls",
    description: "Configure model access, MCPs, and agent rules globally across your organization.",
    icon: Shield,
    color: "#F59E0B",
  },
  {
    title: "Global Compliance",
    description: "Compliant with GDPR, CCPA, and other global data protection regulations.",
    icon: Globe,
    color: "#06B6D4",
  },
  {
    title: "SOC 2 Type 2 Certified",
    description: "Third-party security certifications with annual penetration testing.",
    icon: CheckCircle2,
    color: "#EF4444",
  },
];

export default function SecurityCompliance() {
  return (
    <section className="py-24 bg-neutral-950 text-neutral-50 relative overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center max-w-3xl mx-auto"
        >
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-6">
            Trusted by companies worldwide
          </h2>
          <p className="text-lg text-neutral-400">
            Built with security and compliance at the core.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {securityFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Spotlight
                className="rounded-2xl p-6 min-h-[200px] flex flex-col group"
                spotlightColor={feature.color + "26"}
              >
                <div className="relative z-10">
                  <div
                    className="w-10 h-10 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4 transition-colors duration-300"
                    style={{ borderColor: `${feature.color}30` }}
                  >
                    <feature.icon
                      className="w-5 h-5 transition-colors duration-300"
                      style={{ color: feature.color }}
                    />
                  </div>
                  
                  <h3 className="text-lg font-semibold mb-2 group-hover:text-white transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-neutral-400 leading-relaxed group-hover:text-neutral-300 transition-colors">
                    {feature.description}
                  </p>
                </div>
              </Spotlight>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <Spotlight
            className="rounded-2xl p-8 bg-neutral-900/50 border-neutral-800"
            spotlightColor="rgba(99, 102, 241, 0.1)"
          >
            <p className="text-neutral-300 mb-4">
              <strong className="text-white">Robust data protection:</strong> AES-256 encryption at rest and TLS 1.2+ in transit.
            </p>
            <p className="text-sm text-neutral-400">
              Visit our Trust Center for more information about security and compliance.
            </p>
          </Spotlight>
        </motion.div>
      </div>
    </section>
  );
}

