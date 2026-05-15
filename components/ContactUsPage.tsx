"use client";

import { useFormik } from "formik";
import * as Yup from "yup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Send, Mail, User, MapPin, Clock } from "lucide-react";
import { ToastAction } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";

const validationSchema = Yup.object({
  name: Yup.string().required("Name is required"),
  email: Yup.string()
    .email("Invalid email address")
    .required("Email is required"),
  subject: Yup.string().required("Subject is required"),
  message: Yup.string().required("Message is required"),
});

const sendContactForm = async (data: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) => {
  const response = await axios.post("/api/contact", data);
  return response.data;
};

export default function ContactUsPage() {
  const sendContactFormMutation = useMutation({
    mutationFn: sendContactForm,
    onSuccess: () => {
      toast({
        title: "Message Sent!",
        description: "Thank you for Contacting Us. We'll get back to you soon.",
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
      subject: "",
      message: "",
    },
    validationSchema: validationSchema,
    onSubmit: (values, { resetForm }) => {
      sendContactFormMutation.mutate(values);
      resetForm();
    },
  });

  return (
    <div className="min-h-screen bg-[#09090B] relative font-sans text-zinc-400">
      {/* Structural Background Pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.03]">
          <svg className="w-full h-full">
            <pattern id="contact-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M0 40V0h40" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#contact-grid)" />
          </svg>
        </div>
      </div>

      <div className="container mx-auto px-4 py-32 relative">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={{
            hidden: { opacity: 0 },
            show: { opacity: 1, transition: { staggerChildren: 0.1 } }
          }}
          className="max-w-6xl mx-auto"
        >
          <motion.div 
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
            }}
            className="mb-16"
          >
            <h1 className="text-[44px] md:text-[44px] font-bold mb-6 text-zinc-50 tracking-tighter font-heading">
              Get in Touch
            </h1>
            <p className="text-zinc-400 text-lg leading-relaxed max-w-2xl">
              Have technical questions or partnership proposals? Our team typically responds within 24 business hours.
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-5 gap-12">
            {/* Contact Form */}
            <motion.div
              className="lg:col-span-3"
              variants={{
                hidden: { opacity: 0, x: -20 },
                show: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } }
              }}
            >
              <div className="p-8 bg-zinc-900/40 border border-zinc-900 rounded-2xl">
                <form onSubmit={formik.handleSubmit} className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-zinc-300">Name</Label>
                      <Input
                        id="name"
                        placeholder="Your name"
                        {...formik.getFieldProps("name")}
                        className={`bg-zinc-800/50 border-zinc-800 text-zinc-50 focus:border-zinc-500 focus:ring-zinc-500 transition-all ${
                          formik.touched.name && formik.errors.name ? "border-red-500/50" : ""
                        }`}
                      />
                      {formik.touched.name && formik.errors.name && (
                        <p className="text-[11px] text-red-400">{formik.errors.name}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-zinc-300">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="Your email"
                        {...formik.getFieldProps("email")}
                        className={`bg-zinc-800/50 border-zinc-800 text-zinc-50 focus:border-zinc-500 focus:ring-zinc-500 transition-all ${
                          formik.touched.email && formik.errors.email ? "border-red-500/50" : ""
                        }`}
                      />
                      {formik.touched.email && formik.errors.email && (
                        <p className="text-[11px] text-red-400">{formik.errors.email}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject" className="text-zinc-300">Subject</Label>
                    <Input
                      id="subject"
                      placeholder="Message subject"
                      {...formik.getFieldProps("subject")}
                      className={`bg-zinc-800/50 border-zinc-800 text-zinc-50 focus:border-zinc-500 focus:ring-zinc-500 transition-all ${
                        formik.touched.subject && formik.errors.subject ? "border-red-500/50" : ""
                      }`}
                    />
                    {formik.touched.subject && formik.errors.subject && (
                      <p className="text-[11px] text-red-400">{formik.errors.subject}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message" className="text-zinc-300">Message</Label>
                    <Textarea
                      id="message"
                      placeholder="Detailed project description or query"
                      {...formik.getFieldProps("message")}
                      className={`h-40 bg-zinc-800/50 border-zinc-800 text-zinc-50 focus:border-zinc-500 focus:ring-zinc-500 transition-all resize-none ${
                        formik.touched.message && formik.errors.message ? "border-red-500/50" : ""
                      }`}
                    />
                    {formik.touched.message && formik.errors.message && (
                      <p className="text-[11px] text-red-400">{formik.errors.message}</p>
                    )}
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full bg-zinc-50 hover:bg-zinc-200 text-zinc-950 font-bold py-6 text-lg transition-all"
                  >
                    Send Message
                    <Send className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              </div>
            </motion.div>

            {/* Contact Info */}
            <motion.div
              className="lg:col-span-2 space-y-6"
              variants={{
                hidden: { opacity: 0, x: 20 },
                show: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } }
              }}
            >
              <div className="p-8 bg-zinc-900/40 border border-zinc-900 rounded-2xl h-full space-y-12">
                <div>
                  <h3 className="text-[18px] font-bold text-zinc-50 mb-6 font-heading tracking-tight">Technical Contact</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 text-zinc-400 group cursor-pointer hover:text-zinc-200 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700">
                        <Mail className="h-5 w-5" />
                      </div>
                      <span className="text-sm font-medium">support@insturix.com</span>
                    </div>
                    <div className="flex items-center gap-4 text-zinc-400 group cursor-pointer hover:text-zinc-200 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700">
                        <User className="h-5 w-5" />
                      </div>
                      <span className="text-sm font-medium">+91 92201-21372</span>
                    </div>
                    <div className="flex items-center gap-4 text-zinc-400 group cursor-pointer hover:text-zinc-200 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700">
                        <MapPin className="h-5 w-5" />
                      </div>
                      <span className="text-sm font-medium">A-10 sector 62 Noida</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-[18px] font-bold text-zinc-50 mb-6 font-heading tracking-tight">Operational Hours</h3>
                  <div className="space-y-4 text-sm text-zinc-400">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                        <Clock className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-200">Monday - Friday</p>
                        <p>9:00 AM - 8:00 PM IST</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 opacity-50">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                        <Clock className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-200">Weekend</p>
                        <p>Emergency Support Only</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
