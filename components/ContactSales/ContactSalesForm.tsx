"use client";

import { useFormik } from "formik";
import * as Yup from "yup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Send, Mail, Phone, Clock, CheckCircle2, Shield } from "lucide-react";
import { ToastAction } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const validationSchema = Yup.object({
  name: Yup.string().required("Name is required"),
  email: Yup.string()
    .email("Invalid email address")
    .required("Work email is required"),
  companyName: Yup.string().required("Company name is required"),
  phone: Yup.string(),
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

export default function ContactSalesForm() {
  const sendContactSalesMutation = useMutation({
    mutationFn: sendContactSalesForm,
    onSuccess: () => {
      toast({
        title: "Message Sent!",
        description: "Thank you for contacting us. Our sales team will reach out to you within 24 hours.",
        variant: "default",
        action: <ToastAction altText="Ok">Ok</ToastAction>,
      });
      formik.resetForm();
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
      phone: "",
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
        phone: values.phone || undefined,
        companySize: values.companySize || undefined,
        message: values.message,
      });
    },
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 relative flex items-center py-16">
      {/* Animated background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.03]">
          <svg className="w-full h-full">
            <pattern
              id="grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 .5H32M.5 0V32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-6xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold mb-4 relative">
              Get in touch with our sales team
              <div className="absolute -top-1.5 -left-3 w-12 h-12 bg-indigo-500/10 rounded-full blur-xl"></div>
            </h1>
            <p className="text-lg text-neutral-400 max-w-2xl mx-auto">
              Let's discuss how Insturix Enterprise can help your team deliver better software, faster.
            </p>
          </div>

          <div className="grid lg:grid-cols-5 gap-8">
            {/* Contact Form */}
            <motion.div
              className="lg:col-span-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="p-6 bg-neutral-900/50 backdrop-blur-xs border-neutral-800 transition-transform hover:scale-[1.01] hover:shadow-lg">
                <form onSubmit={formik.handleSubmit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        placeholder="Your name"
                        {...formik.getFieldProps("name")}
                        className={`bg-neutral-950 border-neutral-800 ${
                          formik.touched.name && formik.errors.name
                            ? "border-red-500"
                            : ""
                        }`}
                      />
                      {formik.touched.name && formik.errors.name && (
                        <p className="mt-1 text-sm text-red-500">
                          {formik.errors.name}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="email">Work Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="your.email@company.com"
                        {...formik.getFieldProps("email")}
                        className={`bg-neutral-950 border-neutral-800 ${
                          formik.touched.email && formik.errors.email
                            ? "border-red-500"
                            : ""
                        }`}
                      />
                      {formik.touched.email && formik.errors.email && (
                        <p className="mt-1 text-sm text-red-500">
                          {formik.errors.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="companyName">Company Name</Label>
                      <Input
                        id="companyName"
                        placeholder="Your company"
                        {...formik.getFieldProps("companyName")}
                        className={`bg-neutral-950 border-neutral-800 ${
                          formik.touched.companyName && formik.errors.companyName
                            ? "border-red-500"
                            : ""
                        }`}
                      />
                      {formik.touched.companyName && formik.errors.companyName && (
                        <p className="mt-1 text-sm text-red-500">
                          {formik.errors.companyName}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="companySize">Company Size (Optional)</Label>
                      <Select
                        value={formik.values.companySize}
                        onValueChange={(value) => formik.setFieldValue("companySize", value)}
                      >
                        <SelectTrigger className="bg-neutral-950 border-neutral-800">
                          <SelectValue placeholder="Select size" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1-10">1-10 employees</SelectItem>
                          <SelectItem value="11-50">11-50 employees</SelectItem>
                          <SelectItem value="51-200">51-200 employees</SelectItem>
                          <SelectItem value="201-1000">201-1000 employees</SelectItem>
                          <SelectItem value="1000+">1000+ employees</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="phone">Phone Number (Optional)</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      {...formik.getFieldProps("phone")}
                      className="bg-neutral-950 border-neutral-800"
                    />
                  </div>

                  <div>
                    <Label htmlFor="message">Message / Inquiry Details</Label>
                    <Textarea
                      id="message"
                      placeholder="Tell us about your needs, use cases, or questions..."
                      {...formik.getFieldProps("message")}
                      className={`h-32 bg-neutral-950 border-neutral-800 ${
                        formik.touched.message && formik.errors.message
                          ? "border-red-500"
                          : ""
                      }`}
                    />
                    {formik.touched.message && formik.errors.message && (
                      <p className="mt-1 text-sm text-red-500">
                        {formik.errors.message}
                      </p>
                    )}
                  </div>

                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="agreeToContact"
                      checked={formik.values.agreeToContact}
                      onChange={formik.handleChange}
                      className="mt-1"
                    />
                    <Label htmlFor="agreeToContact" className="text-sm text-neutral-400 cursor-pointer">
                      I agree to be contacted about Insturix Enterprise
                    </Label>
                  </div>
                  {formik.touched.agreeToContact && formik.errors.agreeToContact && (
                    <p className="text-sm text-red-500">
                      {formik.errors.agreeToContact}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full bg-white text-black hover:bg-neutral-200"
                    disabled={sendContactSalesMutation.isPending}
                  >
                    {sendContactSalesMutation.isPending ? (
                      "Sending..."
                    ) : (
                      <>
                        Send Message
                        <Send className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              </Card>
            </motion.div>

            {/* Sidebar */}
            <motion.div
              className="lg:col-span-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="space-y-6">
                {/* Contact Information */}
                <Card className="p-6 bg-neutral-900/50 backdrop-blur-xs border-neutral-800">
                  <h3 className="font-semibold mb-4 text-lg">Contact Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-start text-sm">
                      <Mail className="h-4 w-4 mr-3 text-neutral-500 mt-0.5" />
                      <div>
                        <p className="text-neutral-400">Email</p>
                        <a href="mailto:enterprise@insturix.com" className="text-white hover:text-indigo-400">
                          enterprise@insturix.com
                        </a>
                      </div>
                    </div>
                    <div className="flex items-start text-sm">
                      <Phone className="h-4 w-4 mr-3 text-neutral-500 mt-0.5" />
                      <div>
                        <p className="text-neutral-400">Phone</p>
                        <a href="tel:+919220121372" className="text-white hover:text-indigo-400">
                          +91 92201-21372
                        </a>
                      </div>
                    </div>
                    <div className="flex items-start text-sm">
                      <Clock className="h-4 w-4 mr-3 text-neutral-500 mt-0.5" />
                      <div>
                        <p className="text-neutral-400">Office Hours</p>
                        <p className="text-white">Monday - Friday: 9:00 AM - 8:00 PM</p>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* What Happens Next */}
                <Card className="p-6 bg-neutral-900/50 backdrop-blur-xs border-neutral-800">
                  <h3 className="font-semibold mb-4 text-lg">What Happens Next?</h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-semibold text-indigo-400">1</span>
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">We'll review your inquiry</p>
                        <p className="text-xs text-neutral-400 mt-1">Our team will carefully review your requirements</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-semibold text-indigo-400">2</span>
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">A sales rep will contact you</p>
                        <p className="text-xs text-neutral-400 mt-1">Within 24 hours via email or phone</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-semibold text-indigo-400">3</span>
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">Schedule a personalized demo</p>
                        <p className="text-xs text-neutral-400 mt-1">See Insturix Enterprise in action</p>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Benefits */}
                <Card className="p-6 bg-neutral-900/50 backdrop-blur-xs border-neutral-800">
                  <h3 className="font-semibold mb-4 text-lg">Enterprise Benefits</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-neutral-300">Dedicated account manager</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-neutral-300">24/7 priority support</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-neutral-300">Custom integrations & APIs</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-neutral-300">Enterprise-grade security</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-neutral-300">SLA guarantees</p>
                    </div>
                  </div>
                </Card>

                {/* Trust Signals */}
                <Card className="p-6 bg-neutral-900/50 backdrop-blur-xs border-neutral-800">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="h-5 w-5 text-indigo-400" />
                    <h3 className="font-semibold text-lg">Trusted by</h3>
                  </div>
                  <p className="text-2xl font-bold text-white mb-1">50,000+</p>
                  <p className="text-sm text-neutral-400">Enterprises worldwide</p>
                </Card>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Decorative gradient orbs */}
      <div className="absolute top-1/4 left-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -translate-x-1/2 pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl translate-x-1/2 pointer-events-none"></div>
    </div>
  );
}

