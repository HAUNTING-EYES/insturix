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
  const response = await axios.post("/api/shieldservice", data);
  return response.data;
};

export default function ContactForShield() {
  const sendShieldFormMutation = useMutation({
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
      subject: "Requesting Shield Service",
      message: "",
    },
    validationSchema: validationSchema,
    onSubmit: (values, { resetForm }) => {
      sendShieldFormMutation.mutate(values);
      resetForm();
    },
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))] relative flex items-center">
      {/* Animated background pattern - uses CSS to avoid performance issues */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]">
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
          className="max-w-5xl mx-auto"
        >
          <h1 className="text-3xl font-semibold mb-2 relative">
            Contact Us For Shield Service
            <div className="absolute -top-1.5 -left-3 w-12 h-12 bg-blue-500/10 rounded-full blur-xl"></div>
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-8">
            Want this service for your business? Contact us now.
          </p>

          <div className="grid lg:grid-cols-5 gap-8">
            {/* Contact Form */}
            <motion.div
              className="lg:col-span-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="p-6 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs border-zinc-200/40 dark:border-[rgb(var(--border-light))]/20 transition-transform hover:scale-[1.01] hover:shadow-lg">
                <form onSubmit={formik.handleSubmit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        placeholder="Your name"
                        {...formik.getFieldProps("name")}
                        className={
                          formik.touched.name && formik.errors.name
                            ? "border-red-500"
                            : ""
                        }
                      />
                      {formik.touched.name && formik.errors.name && (
                        <p className="mt-1 text-sm text-red-500">
                          {formik.errors.name}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="Your email"
                        {...formik.getFieldProps("email")}
                        className={
                          formik.touched.email && formik.errors.email
                            ? "border-red-500"
                            : ""
                        }
                      />
                      {formik.touched.email && formik.errors.email && (
                        <p className="mt-1 text-sm text-red-500">
                          {formik.errors.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      placeholder="Message subject"
                      disabled
                      {...formik.getFieldProps("subject")}
                      className={
                        formik.touched.subject && formik.errors.subject
                          ? "border-red-500"
                          : ""
                      }
                    />
                    {formik.touched.subject && formik.errors.subject && (
                      <p className="mt-1 text-sm text-red-500">
                        {formik.errors.subject}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      placeholder="Your message"
                      {...formik.getFieldProps("message")}
                      className={`h-32 ${
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

                  <Button type="submit" className="w-full">
                    Send Message
                    <Send className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              </Card>
            </motion.div>

            {/* Contact Info */}
            <motion.div
              className="lg:col-span-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="p-6 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs border-zinc-200/40 dark:border-[rgb(var(--border-light))]/20 transition-transform hover:scale-[1.01] hover:shadow-lg">
                <div className="space-y-6">
                  <div>
                    <h3 className="font-medium mb-4">Contact Information</h3>
                    <div className="space-y-3">
                      <div className="flex items-center text-sm">
                        <Mail className="h-4 w-4 mr-3 text-zinc-500" />
                        <span>info@insturance.com</span>
                      </div>
                      <div className="flex items-center text-sm">
                        <User className="h-4 w-4 mr-3 text-zinc-500" />
                        <span>+91 92201-21372</span>
                      </div>
                      <div className="flex items-center text-sm">
                        <MapPin className="h-4 w-4 mr-3 text-zinc-500" />
                        <span>A-10 sector 62 Noida</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-4">Office Hours</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-3 text-zinc-500" />
                        <span>Monday - Friday: 9:00 AM - 8:00 PM</span>
                      </div>
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-3 text-zinc-500" />
                        <span>Saturday & Sunday: Closed</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Decorative gradient orbs */}
      <div className="absolute top-1/4 left-0 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-3xl -translate-x-1/2"></div>
      <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl translate-x-1/2"></div>
    </div>
  );
}
