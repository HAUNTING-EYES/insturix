"use client";

import { useFormik } from "formik";
import * as Yup from "yup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Send, Mail, User, MessageSquare } from "lucide-react";
import { ToastAction } from "@/components/ui/toast";

const validationSchema = Yup.object({
  name: Yup.string().required("Name is required"),
  email: Yup.string()
    .email("Invalid email address")
    .required("Email is required"),
  subject: Yup.string().required("Subject is required"),
  message: Yup.string().required("Message is required"),
});

export default function ContactUsPage() {
  const formik = useFormik({
    initialValues: {
      name: "",
      email: "",
      subject: "",
      message: "",
    },
    validationSchema: validationSchema,
    onSubmit: (values, { resetForm }) => {
      console.log(values);
      try {
        toast({
          title: "Message Sent!",
          description:
            "Thank you for your contribution. We'll get back to you soon.",
          variant: "default",
          action: <ToastAction altText="Ok">Ok</ToastAction>,
        });
      } catch (error) {
        console.error("Error displaying toast:", error);
        toast({
          title: "Error",
          description: "Something went wrong. Please try again later.",
          variant: "destructive",
          action: <ToastAction altText="Ok">Ok</ToastAction>,
        });
      }
      resetForm();
    },
  });

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-800 dark:text-gray-200">
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-6xl font-bold mb-3 text-center bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent">
          Contact Us
        </h1>
        <p className="text-xl md:text-2xl text-center mb-16 text-black dark:text-white max-w-3xl mx-auto">
          We&apos;d love to hear from you. Whether you have a question about our
          services, pricing, or anything else, our team is ready to answer all
          your questions.
        </p>

        <div className="grid md:grid-cols-2 gap-16 items-start">
          <div className="space-y-8">
            <div className="bg-white dark:bg-black p-8 rounded-lg shadow-lg dark:border">
              <h2 className="text-3xl font-light mb-6 text-gray-800 dark:text-gray-200">
                Send us a message
              </h2>
              <form onSubmit={formik.handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label
                    htmlFor="name"
                    className="text-lg text-gray-700 dark:text-gray-300"
                  >
                    Name
                  </Label>
                  <div className="relative">
                    <Input
                      id="name"
                      placeholder="Your name"
                      {...formik.getFieldProps("name")}
                      className={`pl-10 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 ${
                        formik.touched.name && formik.errors.name
                          ? "border-red-500"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                    />
                    <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  </div>
                  {formik.touched.name && formik.errors.name && (
                    <div className="text-red-500 text-sm">
                      {formik.errors.name}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-lg text-gray-700 dark:text-gray-300"
                  >
                    Email
                  </Label>
                  <div className="relative">
                    <Input
                      id="email"
                      type="email"
                      placeholder="Your email"
                      {...formik.getFieldProps("email")}
                      className={`pl-10 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 ${
                        formik.touched.email && formik.errors.email
                          ? "border-red-500"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                    />
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  </div>
                  {formik.touched.email && formik.errors.email && (
                    <div className="text-red-500 text-sm">
                      {formik.errors.email}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="subject"
                    className="text-lg text-gray-700 dark:text-gray-300"
                  >
                    Subject
                  </Label>
                  <div className="relative">
                    <Input
                      id="subject"
                      placeholder="Message subject"
                      {...formik.getFieldProps("subject")}
                      className={`pl-10 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 ${
                        formik.touched.subject && formik.errors.subject
                          ? "border-red-500"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                    />
                    <MessageSquare className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  </div>
                  {formik.touched.subject && formik.errors.subject && (
                    <div className="text-red-500 text-sm">
                      {formik.errors.subject}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="message"
                    className="text-lg text-gray-700 dark:text-gray-300"
                  >
                    Message
                  </Label>
                  <Textarea
                    id="message"
                    placeholder="Your message"
                    {...formik.getFieldProps("message")}
                    className={`min-h-[150px] bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 ${
                      formik.touched.message && formik.errors.message
                        ? "border-red-500"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  />
                  {formik.touched.message && formik.errors.message && (
                    <div className="text-red-500 text-sm">
                      {formik.errors.message}
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-black dark:bg-gray-200 text-white dark:text-gray-800 hover:bg-gray-800 dark:hover:bg-gray-300 text-lg py-6"
                >
                  Send Message
                  <Send className="ml-2 h-5 w-5" />
                </Button>
              </form>
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-black dark:bg-white text-white dark:text-black p-8 rounded-lg shadow-lg">
              <h2 className="text-3xl font-light mb-6 bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent">
                Contact Information
              </h2>
              <div className="space-y-4">
                <p className="flex items-center">
                  <Mail className="mr-4 h-6 w-6" />
                  info@insturance.com
                </p>
                <p className="flex items-center">
                  <User className="mr-4 h-6 w-6" />
                  +91 74289 47901
                </p>
                <p className="flex items-center">
                  <MessageSquare className="mr-4 h-6 w-6" />
                  A-10 sector 62 Noida
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-black dark:border p-8 rounded-lg shadow-lg">
              <h2 className="text-3xl font-light mb-6 bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent">
                Office Hours
              </h2>
              <ul className="space-y-2 text-black dark:text-white">
                <li>Monday - Friday: 9:00 AM - 8:00 PM</li>
                <li>Saturday & Sunday: Closed</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
