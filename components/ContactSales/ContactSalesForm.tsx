"use client";

import { useFormik } from "formik";
import * as Yup from "yup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Send, Mail, Phone, Clock, CheckCircle2, Shield, Sparkles as SparklesIcon, ChevronDown, Check } from "lucide-react";
import { ToastAction } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import dynamic from "next/dynamic";
import { useEffect, useState, useRef, useCallback } from "react";
import "react-phone-number-input/style.css";
import PhoneInput from "react-phone-number-input";
import { Particles } from "@/components/ui/Particles";

const LightRays = dynamic(() => import("@/components/ui/LightRays"), { ssr: false });

const PERSONAL_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'protonmail.com', 'icloud.com'];

const isPersonalEmail = (email: string) => {
  const domain = email.split('@')[1]?.toLowerCase();
  return PERSONAL_EMAIL_DOMAINS.includes(domain);
};

const validationSchema = Yup.object({
  name: Yup.string().required("Name is required"),
  email: Yup.string()
    .email("Invalid email address")
    .required("Work email is required"),
  companyName: Yup.string()
    .required("Company name is required")
    .max(40, "Company name must be 40 characters or less"),
  phoneNumber: Yup.string(),
  companySize: Yup.string(),
  message: Yup.string().required("Message is required"),
  agreeToContact: Yup.boolean().oneOf([true], "You must agree to be contacted"),
});

const sendContactSalesForm = async (data: {
  name: string;
  email: string;
  companyName: string;
  phone?: string;
  companySize?: string;
  message: string;
}) => {
  const response = await axios.post("/api/contact-sales", data);
  return response.data;
};

type Theme = "system" | "light" | "dark";

export type ShipStickyHeaderProps = {
  items?: string[];
  theme?: Theme;
  animate?: boolean;
  hue?: number;
  startVh?: number;
  spaceVh?: number;
  debug?: boolean;
};

function WordHeroSection({
  items = [
    "Plan your content.",
    "Generate creative assets.",
    "Edit finished media.",
    "Add music and sound.",
    "Analyze performance signals.",
    "Publish and share.",
    "Collaborate across teams.",
    "Ship with Insturix."
  ],
  theme = "system",
  animate = true,
  hue = 24, // Business orange hue approx
  startVh = 50,
  spaceVh = 50,
  debug = false,
}: ShipStickyHeaderProps) {
  // Product colors mapping
  const productColors = [
    "#ef4444", // Planning - Red
    "#9333EA", // Creative assets - Purple
    "#14B8A6", // Editing - Teal
    "#EAB308", // Music and sound - Amber
    "#3B81F5", // Analysis - Blue
    "#0EA5E9", // Publishing - Sky
    "#22c55e", // Collaboration - Green
    "#ff5722", // Insturix - Orange
  ];

  useEffect(() => {
    // Only apply CSS vars to this local scope if possible, or root
    // Since this component is inside the page, we'll inline styles where possible or use a scoped style block
    const root = document.documentElement;
    root.style.setProperty("--start", `${startVh}vh`);
    root.style.setProperty("--space", `${spaceVh}vh`);

    // Set product colors as CSS variables
    productColors.forEach((color, index) => {
      root.style.setProperty(`--product-color-${index}`, color);
    });
  }, [startVh, spaceVh]);

  return (
    <div
      className="w-full relative min-h-[300vh]"
      style={{
        ["--count" as any]: items.length,
      } as React.CSSProperties}
    >
      <div
        aria-hidden
        style={{
          height: `calc((var(--count) - 1) * 1lh)`,
        }}
      />

      <header className="relative leading-[1.2] flex items-start w-full mb-(--space)">
        <section className="flex w-full items-start justify-start pt-[calc(var(--start)-0.5lh)]">
          <h1 className="sr-only">
            <span>you can&nbsp;</span>
            <span className="sr-only">you can ship things.</span>
          </h1>

          <ul aria-hidden="true" className="font-bold list-none p-0 m-0 text-[44px] sm:text-[110px] md:text-7xl lg:text-8xl tracking-tight">
            {items.map((word, i) => (
              <li
                key={i}
                className="word-hero-item"
                style={{
                  ["--i" as any]: i,
                  ["--product-color" as any]: productColors[i] || "#ff5722"
                } as React.CSSProperties}
              >
                {word}
              </li>
            ))}
          </ul>
        </section>
      </header>

      <div className="mt-[20vh] space-y-24 pb-24">
        {/* What Happens Next */}
        <section className="space-y-8">
          <h2 className="text-[32px] font-bold text-white">What Happens Next?</h2>
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-[#ff5722]/10 flex items-center justify-center shrink-0 mt-1 border border-[#ff5722]/20">
                <span className="text-sm font-bold text-[#ff5722]">1</span>
              </div>
              <div>
                <p className="text-[18px] text-white font-medium">We'll review your inquiry</p>
                <p className="text-neutral-400 mt-2">Our team will carefully review your requirements to ensure we're the perfect fit.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-[#ff5722]/10 flex items-center justify-center shrink-0 mt-1 border border-[#ff5722]/20">
                <span className="text-sm font-bold text-[#ff5722]">2</span>
              </div>
              <div>
                <p className="text-[18px] text-white font-medium">A sales rep will contact you</p>
                <p className="text-neutral-400 mt-2">Within 24 hours via email or phone to curate a plan for you.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-[#ff5722]/10 flex items-center justify-center shrink-0 mt-1 border border-[#ff5722]/20">
                <span className="text-sm font-bold text-[#ff5722]">3</span>
              </div>
              <div>
                <p className="text-[18px] text-white font-medium">Schedule a personalized demo</p>
                <p className="text-neutral-400 mt-2">See Insturix Business in action tailored to your workflow.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="space-y-8">
          <h2 className="text-[32px] font-bold text-white">Business Benefits</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <Card className="p-6 bg-neutral-900/30 backdrop-blur-sm border border-neutral-800">
              <CheckCircle2 className="h-6 w-6 text-[#ff5722] mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Dedicated Account Manager</h3>
              <p className="text-sm text-neutral-400">Your personal guide to success with Insturix.</p>
            </Card>
            <Card className="p-6 bg-neutral-900/30 backdrop-blur-sm border border-neutral-800">
              <Shield className="h-6 w-6 text-[#ff5722] mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Business Security</h3>
              <p className="text-sm text-neutral-400">Bank-grade encryption and zero data retention policies.</p>
            </Card>
            <Card className="p-6 bg-neutral-900/30 backdrop-blur-sm border border-neutral-800">
              <Clock className="h-6 w-6 text-[#ff5722] mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">24/7 Priority Support</h3>
              <p className="text-sm text-neutral-400">Round-the-clock assistance for critical needs.</p>
            </Card>
            <Card className="p-6 bg-neutral-900/30 backdrop-blur-sm border border-neutral-800">
              <SparklesIcon className="h-6 w-6 text-[#ff5722] mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Custom Integrations</h3>
              <p className="text-sm text-neutral-400">Seamlessly connect with your existing stack.</p>
            </Card>
          </div>
        </section>
      </div>

      <style jsx global>{`
        :root {
          --start: 50vh;
          --space: 50vh;
        }
        
        .word-hero-item {
          --dimmed: rgba(255, 255, 255, 0.2);
          
          /* The magic gradient that reveals text based on scroll position */
          background: linear-gradient(
            180deg,
            var(--dimmed) 0 calc(var(--start) - 0.5lh),
            var(--product-color, #ff5722) calc(var(--start) - 0.55lh) calc(var(--start) + 0.55lh),
            var(--dimmed) calc(var(--start) + 0.5lh)
          );
          background-attachment: fixed;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        
        .PhoneInputInput {
          background: transparent;
          border: none;
          color: white !important;
          outline: none;
          font-size: 0.875rem;
          height: 100%;
          width: 100%;
          padding: 0;
        }
        .PhoneInputInput:focus {
          color: white !important;
        }
        .PhoneInputInput::placeholder {
           color: #737373;
        }
        .PhoneInput {
           display: flex;
           align-items: center;
           gap: 0.5rem;
           width: 100%;
           height: 100%;
        }
        .PhoneInputCountry {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        .PhoneInputCountrySelect {
          background: #171717 !important;
          border: 1px solid #404040 !important;
          border-radius: 6px !important;
          color: white !important;
          padding: 8px !important;
          margin-right: 0.5rem;
          cursor: pointer;
          font-size: 0.875rem;
        }
        .PhoneInputCountrySelect:focus {
          outline: none;
          border-color: rgba(255, 87, 34, 0.5) !important;
          box-shadow: 0 0 0 2px rgba(255, 87, 34, 0.2);
        }
        .PhoneInputCountrySelect option {
          background: #171717 !important;
          color: white !important;
          padding: 8px;
        }
        /* Force flag visibility - targets SVG flags from react-phone-number-input */
        .PhoneInputCountryIcon {
          width: 1.5em !important;
          height: 1em !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .PhoneInputCountryIcon--square {
          width: 1em !important;
        }
        .PhoneInputCountryIconImg {
          max-width: 100% !important;
          max-height: 100% !important;
        }
        /* Target the SVG flag icons */
        .PhoneInputCountryIcon svg {
          width: 100% !important;
          height: 100% !important;
        }
        .PhoneInputCountrySelectArrow {
          border-color: #737373 !important;
          opacity: 1 !important;
          margin-left: 4px;
        }
      `}</style>
    </div>
  );
}

// Custom dropdown component that doesn't use portals - prevents scroll jumping in sticky containers
const COMPANY_SIZE_OPTIONS = [
  { value: "1-10", label: "1-10" },
  { value: "11-50", label: "11-50" },
  { value: "51-200", label: "51-200" },
  { value: "201-1000", label: "201-1000" },
  { value: "1000+", label: "1000+" },
];

function CompanySizeDropdown({ 
  value, 
  onChange, 
  idPrefix 
}: { 
  value: string; 
  onChange: (value: string) => void; 
  idPrefix: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const selectedOption = COMPANY_SIZE_OPTIONS.find(opt => opt.value === value);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        id={`companySize${idPrefix}`}
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-full items-center justify-between rounded-md bg-neutral-950/50 border border-neutral-800 px-3 text-sm text-white focus:ring-2 focus:ring-[#ff5722]/20 focus:border-[#ff5722]/50 focus:outline-none transition-colors hover:bg-neutral-950/70"
      >
        <span className={selectedOption ? "text-white" : "text-neutral-500"}>
          {selectedOption?.label || "Employees"}
        </span>
        <ChevronDown className={`h-4 w-4 opacity-50 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md bg-neutral-900 border border-neutral-800 shadow-lg overflow-hidden"
          >
            <div className="p-1 max-h-64 overflow-y-auto">
              {COMPANY_SIZE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`relative flex w-full items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none transition-colors ${
                    value === option.value 
                      ? "bg-neutral-800 text-white" 
                      : "text-neutral-200 hover:bg-neutral-800 hover:text-white"
                  }`}
                >
                  {option.label}
                  {value === option.value && (
                    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ContactSalesForm() {
  const [xText, setXText] = useState("");
  const [companyNameForHeader, setCompanyNameForHeader] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedCompanyName, setSubmittedCompanyName] = useState("");

  // Typewriter effect for "INSTURIX  x  "
  useEffect(() => {
    const timeout = setTimeout(() => {
      let i = 0;
      const target = "INSTURIX  x  ";
      const interval = setInterval(() => {
        if (i < target.length) {
          setXText(target.substring(0, i + 1));
          i++;
        } else {
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }, 500);
    return () => clearTimeout(timeout);
  }, []);

  const sendContactSalesMutation = useMutation({
    mutationFn: sendContactSalesForm,
    onSuccess: () => {
      // Store the company name before form reset
      setSubmittedCompanyName(companyNameForHeader);
      // Trigger the submission animation
      setIsSubmitted(true);
      toast({
        title: "Message Sent!",
        description: "Thank you for contacting us. Our sales team will reach out to you within 24 hours.",
        variant: "default",
        action: <ToastAction altText="Ok">Ok</ToastAction>,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again later.",
        variant: "destructive",
        action: <ToastAction altText="Ok">Ok</ToastAction>,
      });
    },
  });

  const formik = useFormik({
    initialValues: {
      name: "",
      email: "",
      companyName: "",
      phoneNumber: "",
      companySize: "",
      message: "",
      agreeToContact: false,
    },
    validationSchema: validationSchema,
    onSubmit: (values) => {
      sendContactSalesMutation.mutate({
        name: values.name,
        email: values.email,
        companyName: values.companyName,
        phone: values.phoneNumber,
        companySize: values.companySize || undefined,
        message: values.message,
      });
    },
  });

  // Reset form on successful submission
  useEffect(() => {
    if (sendContactSalesMutation.isSuccess) {
      formik.resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendContactSalesMutation.isSuccess]);



  // Debounced update for the header company name - using ref to avoid re-renders
  const headerUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const updateCompanyNameForHeader = useCallback((value: string) => {
    if (headerUpdateTimeoutRef.current) {
      clearTimeout(headerUpdateTimeoutRef.current);
    }
    headerUpdateTimeoutRef.current = setTimeout(() => {
      setCompanyNameForHeader(value);
    }, 300);
  }, []);

  // Form content JSX - defined as a function that returns JSX, not a component
  const renderFormContent = (idPrefix = "") => (
    <>
      <div className="flex flex-col gap-0.5 mb-2">
        <h2 className="text-[18px] font-semibold text-white">Let's talk business.</h2>
        <p className="text-[11px] text-neutral-400">Tell us about your needs and we'll be in touch shortly.</p>
      </div>

      <form onSubmit={formik.handleSubmit} className="space-y-2">
        <div>
          <Label htmlFor={`name${idPrefix}`} className="mb-1 block text-sm">Name</Label>
          <Input
            id={`name${idPrefix}`}
            placeholder="Your name"
            {...formik.getFieldProps("name")}
            className={`bg-neutral-950/50 border-neutral-800 focus:border-[#ff5722]/50 focus:ring-[#ff5722]/20 h-8 text-sm text-white placeholder:text-neutral-500 ${formik.touched.name && formik.errors.name
              ? "border-red-500"
              : ""
              }`}
          />
          {formik.touched.name && formik.errors.name && (
            <p className="mt-0.5 text-[11px] text-red-500">
              {formik.errors.name}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor={`email${idPrefix}`} className="mb-1 block text-sm">Work Email</Label>
          <Input
            id={`email${idPrefix}`}
            type="email"
            placeholder="name@company.com"
            {...formik.getFieldProps("email")}
            className={`bg-neutral-950/50 border-neutral-800 focus:border-[#ff5722]/50 focus:ring-[#ff5722]/20 h-9 text-sm text-white placeholder:text-neutral-500 ${formik.touched.email && formik.errors.email
              ? "border-red-500"
              : ""
              }`}
          />
          {formik.touched.email && formik.errors.email && (
            <p className="mt-0.5 text-[11px] text-red-500">
              {formik.errors.email}
            </p>
          )}
          {formik.values.email && !formik.errors.email && isPersonalEmail(formik.values.email) && (
            <p className="mt-0.5 text-[11px] text-amber-500">
              We recommend using your work email for faster assistance.
            </p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`companyName${idPrefix}`} className="mb-1 block text-sm">Company</Label>
            <Input
              id={`companyName${idPrefix}`}
              placeholder="Company name"
              name="companyName"
              maxLength={40}
              value={formik.values.companyName}
              onChange={(e) => {
                formik.handleChange(e);
                updateCompanyNameForHeader(e.target.value);
              }}
              onBlur={formik.handleBlur}
              className={`bg-neutral-950/50 border-neutral-800 focus:border-[#ff5722]/50 focus:ring-[#ff5722]/20 h-9 text-sm text-white placeholder:text-neutral-500 ${formik.touched.companyName && formik.errors.companyName
                ? "border-red-500"
                : ""
                }`}
            />
            <div className="flex justify-between items-center mt-0.5">
              {formik.touched.companyName && formik.errors.companyName ? (
                <p className="text-[11px] text-red-500">
                  {formik.errors.companyName}
                </p>
              ) : <span />}
              <span className={`text-[11px] ${formik.values.companyName.length >= 35 ? 'text-amber-500' : 'text-neutral-500'}`}>
                {formik.values.companyName.length}/40
              </span>
            </div>
          </div>
          <div>
            <Label htmlFor={`companySize${idPrefix}`} className="mb-1 block text-sm">Size</Label>
            <CompanySizeDropdown
              value={formik.values.companySize}
              onChange={(value) => formik.setFieldValue("companySize", value)}
              idPrefix={idPrefix}
            />
          </div>
        </div>

        <div>
          <Label htmlFor={`phone${idPrefix}`} className="mb-1 block text-sm">Phone Number</Label>
          <div className="bg-neutral-950/50 border border-neutral-800 rounded-md px-2.5 py-0.5 h-9 flex items-center focus-within:ring-2 focus-within:ring-[#ff5722]/20 focus-within:border-[#ff5722]/50 transition-all">
            <PhoneInput
              placeholder="Enter phone number"
              value={formik.values.phoneNumber}
              onChange={(value) => formik.setFieldValue("phoneNumber", value || "")}
              defaultCountry="US"
              international
              countryCallingCodeEditable={false}
              className="w-full"
            />
          </div>
          {formik.values.phoneNumber && formik.values.phoneNumber.replace(/\D/g, '').length > 15 && (
            <p className="mt-0.5 text-[11px] text-amber-500">
              Phone number seems too long. Please verify.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor={`message${idPrefix}`} className="mb-1 block text-sm">Message</Label>
          <Textarea
            id={`message${idPrefix}`}
            placeholder="How can we help you?"
            rows={4}
            {...formik.getFieldProps("message")}
            className={`min-h-[96px] max-h-[180px] overflow-y-auto bg-neutral-950/50 border-neutral-800 focus:border-[#ff5722]/50 focus:ring-[#ff5722]/20 resize-y text-sm text-white placeholder:text-neutral-500 ${formik.touched.message && formik.errors.message
              ? "border-red-500"
              : ""
              }`}
          />
          {formik.touched.message && formik.errors.message && (
            <p className="mt-0.5 text-[11px] text-red-500">
              {formik.errors.message}
            </p>
          )}
        </div>

        <div className="flex items-start gap-3 pt-2 -ml-1 cursor-pointer" onClick={() => formik.setFieldValue("agreeToContact", !formik.values.agreeToContact)}>
          <input
            type="checkbox"
            id={`agreeToContact${idPrefix}`}
            checked={formik.values.agreeToContact}
            onChange={(e) => formik.setFieldValue("agreeToContact", e.target.checked)}
            className="mt-1 h-5 w-5 rounded border-neutral-700 bg-neutral-900 text-[#ff5722] focus:ring-[#ff5722]/20 accent-[#ff5722] cursor-pointer shrink-0 pointer-events-none"
          />
          <Label htmlFor={`agreeToContact${idPrefix}`} className="text-[11px] text-neutral-400 cursor-pointer font-normal leading-relaxed pt-0.5 select-none">
            I agree to allow Insturix to store and process my personal data to handle my request.
          </Label>
        </div>
        {formik.touched.agreeToContact && formik.errors.agreeToContact && (
          <p className="text-[11px] text-red-500">
            {formik.errors.agreeToContact}
          </p>
        )}

        <Button
          type="submit"
          className="w-full bg-[#ff5722] hover:bg-[#f4511e] text-white font-medium h-10 text-sm shadow-[0_4px_14px_0_rgba(255,87,34,0.39)] transition-all hover:scale-[1.02]"
          disabled={sendContactSalesMutation.isPending}
        >
          {sendContactSalesMutation.isPending ? (
            "Sending..."
          ) : (
            <>
              Contact Sales
              <Send className="ml-2 h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </form>
    </>
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 relative flex flex-col">
      {/* Animated background pattern */}
      <div className="fixed inset-0 pointer-events-none z-0 h-screen">
        <LightRays
          raysColor="#ff5722"
          raysSpeed={0.2}
          raysOrigin="top-center"
          lightSpread={0.5}
          rayLength={1.5}
          fadeDistance={0.8}
          className="opacity-60"
        />
      </div>

      {/* Particles overlay - shown after submission */}
      {isSubmitted && (
        <div className="absolute inset-0 pointer-events-none z-10">
          <Particles
            className="w-full h-full"
            quantity={80}
            staticity={30}
            ease={80}
            size={0.5}
            color="#ff5722"
            vx={0}
            vy={0}
          />
        </div>
      )}

      {/* Success state - centered hero */}
      <AnimatePresence>
        {isSubmitted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative z-20 min-h-screen"
          >
            {/* Hero section */}
            <div className="flex items-center justify-center min-h-[70vh] px-4">
              <div className="text-center">
                <motion.div
                  initial={{ y: 20, opacity: 0, scale: 0.9 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5, duration: 0.6, type: "spring", stiffness: 100 }}
                  className="flex flex-col items-center gap-4"
                >
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
                    <span 
                      className="text-white tracking-[0.3em] text-[44px] sm:text-[44px] md:text-[110px] lg:text-7xl xl:text-8xl"
                      style={{ fontFamily: 'Blanka, sans-serif' }}
                    >
                      INSTURIX
                    </span>
                    <span className="text-white font-bold text-2xl sm:text-[32px] md:text-[44px] lg:text-[44px] xl:text-[110px]">
                      x
                    </span>
                    <span className="text-white font-bold text-[44px] sm:text-[44px] md:text-[110px] lg:text-7xl xl:text-8xl break-words">
                      {submittedCompanyName}
                      <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.2, duration: 0.5 }}
                        className="text-[#ff5722]"
                      >
                        ?
                      </motion.span>
                    </span>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.5, duration: 0.5, type: "spring" }}
                    className="mt-6"
                  >
                    <CheckCircle2 className="h-16 w-16 text-[#ff5722]" />
                  </motion.div>
                </motion.div>
              </div>
            </div>

            {/* What Happens Next & Business Benefits */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.8, duration: 0.8 }}
              className="container mx-auto px-4 pb-24"
            >
              <div className="max-w-4xl mx-auto space-y-16">
                {/* What Happens Next */}
                <section className="space-y-8">
                  <h2 className="text-[32px] font-bold text-white">What Happens Next?</h2>
                  <div className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-[#ff5722]/10 flex items-center justify-center shrink-0 mt-1 border border-[#ff5722]/20">
                        <span className="text-sm font-bold text-[#ff5722]">1</span>
                      </div>
                      <div>
                        <p className="text-[18px] text-white font-medium">We'll review your inquiry</p>
                        <p className="text-neutral-400 mt-2">Our team will carefully review your requirements to ensure we're the perfect fit.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-[#ff5722]/10 flex items-center justify-center shrink-0 mt-1 border border-[#ff5722]/20">
                        <span className="text-sm font-bold text-[#ff5722]">2</span>
                      </div>
                      <div>
                        <p className="text-[18px] text-white font-medium">A sales rep will contact you</p>
                        <p className="text-neutral-400 mt-2">Within 24 hours via email or phone to curate a plan for you.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-[#ff5722]/10 flex items-center justify-center shrink-0 mt-1 border border-[#ff5722]/20">
                        <span className="text-sm font-bold text-[#ff5722]">3</span>
                      </div>
                      <div>
                        <p className="text-[18px] text-white font-medium">Schedule a personalized demo</p>
                        <p className="text-neutral-400 mt-2">See Insturix Business in action tailored to your workflow.</p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Business Benefits */}
                <section className="space-y-8">
                  <h2 className="text-[32px] font-bold text-white">Business Benefits</h2>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <Card className="p-6 bg-neutral-900/30 backdrop-blur-sm border border-neutral-800">
                      <CheckCircle2 className="h-6 w-6 text-[#ff5722] mb-4" />
                      <h3 className="text-lg font-semibold text-white mb-2">Dedicated Account Manager</h3>
                      <p className="text-sm text-neutral-400">Your personal guide to success with Insturix.</p>
                    </Card>
                    <Card className="p-6 bg-neutral-900/30 backdrop-blur-sm border border-neutral-800">
                      <Shield className="h-6 w-6 text-[#ff5722] mb-4" />
                      <h3 className="text-lg font-semibold text-white mb-2">Business Security</h3>
                      <p className="text-sm text-neutral-400">Bank-grade encryption and zero data retention policies.</p>
                    </Card>
                    <Card className="p-6 bg-neutral-900/30 backdrop-blur-sm border border-neutral-800">
                      <Clock className="h-6 w-6 text-[#ff5722] mb-4" />
                      <h3 className="text-lg font-semibold text-white mb-2">24/7 Priority Support</h3>
                      <p className="text-sm text-neutral-400">Round-the-clock assistance for critical needs.</p>
                    </Card>
                    <Card className="p-6 bg-neutral-900/30 backdrop-blur-sm border border-neutral-800">
                      <SparklesIcon className="h-6 w-6 text-[#ff5722] mb-4" />
                      <h3 className="text-lg font-semibold text-white mb-2">Custom Integrations</h3>
                      <p className="text-sm text-neutral-400">Seamlessly connect with your existing stack.</p>
                    </Card>
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content - fades out on submission */}
      {!isSubmitted && (
        <section className="relative flex-1">
          <div className="container mx-auto px-4 py-8 md:py-16 relative z-10">
            {/* Desktop Layout - Side by side */}
            <div className="hidden lg:flex lg:gap-24">
              {/* LEFT SIDE - Scrollable Story */}
              <div className="relative flex-1 lg:min-w-0">
                {/* INSTURIX x Brand - vertically aligned with form middle */}
                <div className="flex items-start mb-4 w-full lg:min-h-[420px] lg:items-center">
                  <div className="text-white flex items-center w-full transition-all duration-300">
                    {/* INSTURIX - using Blanka font */}
                    <span 
                      className="shrink-0 tracking-[0.3em] whitespace-nowrap leading-none text-[44px]"
                      style={{ fontFamily: 'Blanka, sans-serif' }}
                    >
                      {xText.slice(0, 8)}
                    </span>
                    {/* Spacer */}
                    <span className="shrink-0 w-6">{xText.length > 8 ? '' : ''}</span>
                    {/* x - smaller, vertically centered */}
                    {xText.length > 10 && (
                      <span className="font-bold shrink-0 text-2xl">
                        x
                      </span>
                    )}
                    {/* Spacer */}
                    <span className="shrink-0 w-6"></span>
                    {/* Brand - same size as INSTURIX, word-wraps when needed */}
                    <span 
                      className="font-bold min-w-0 flex-1 transition-all duration-200 text-[44px] break-words"
                      style={{ lineHeight: '1.1' }}
                    >
                      {companyNameForHeader}
                      <span className="animate-blink text-[#ff5722]">|</span>
                    </span>
                  </div>
                </div>
                <div className="relative">
                  <WordHeroSection />
                </div>
              </div>

              {/* RIGHT SIDE - Sticky Form */}
              <div className="lg:w-[480px] lg:shrink-0">
                <div className="sticky top-20">
                  <Card className="p-4 sm:p-5 bg-neutral-900/60 backdrop-blur-md border border-neutral-800/80 shadow-[0_25px_120px_rgba(255,87,34,0.05)]">
                    {renderFormContent("")}
                  </Card>

                  <div className="mt-4 flex justify-center gap-6 text-neutral-500">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="text-[11px]">support@insturix.com</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5" />
                      <span className="text-[11px]">+91 92201-21372</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Layout - Stacked (Header → Form → Hero) */}
            <div className="lg:hidden">
              {/* INSTURIX x Brand Header */}
              <div className="flex items-center justify-center mb-8">
                <div className="text-white flex items-center flex-wrap justify-center gap-2 transition-all duration-300">
                  {/* INSTURIX - using Blanka font */}
                  <span 
                    className="shrink-0 tracking-[0.3em] whitespace-nowrap leading-none text-2xl sm:text-[32px] md:text-[44px]"
                    style={{ fontFamily: 'Blanka, sans-serif' }}
                  >
                    {xText.slice(0, 8)}
                  </span>
                  {/* x - smaller, vertically centered */}
                  {xText.length > 10 && (
                    <span className="font-bold shrink-0 text-[14px] sm:text-lg md:text-[18px] mx-2 sm:mx-4">
                      x
                    </span>
                  )}
                  {/* Brand - same size as INSTURIX */}
                  <span 
                    className="font-bold transition-all duration-200 text-2xl sm:text-[32px] md:text-[44px] break-words text-center"
                    style={{ lineHeight: '1.1' }}
                  >
                    {companyNameForHeader}
                    <span className="animate-blink text-[#ff5722]">|</span>
                  </span>
                </div>
              </div>

              {/* Form - Centered */}
              <div className="max-w-xl mx-auto mb-12">
                <Card className="p-6 sm:p-8 bg-neutral-900/60 backdrop-blur-md border border-neutral-800/80 shadow-[0_25px_120px_rgba(255,87,34,0.05)]">
                  {renderFormContent("-mobile")}
                </Card>

                <div className="mt-4 flex justify-center gap-6 text-neutral-500">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <span className="text-sm">support@insturix.com</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <span className="text-sm">+91 92201-21372</span>
                  </div>
                </div>
              </div>

              {/* WordHeroSection - below form */}
              <div className="relative">
                <WordHeroSection />
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
