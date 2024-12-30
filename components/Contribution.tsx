"use client";

import {
  ArrowRight,
  Github,
  Twitter,
  Linkedin,
  DollarSign,
  Star,
  Heart,
  Instagram,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import * as Yup from "yup";
import { useFormik } from "formik";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Send, Mail, User, MessageSquare } from "lucide-react";
import { ToastAction } from "@/components/ui/toast";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

const validationSchema = Yup.object({
  name: Yup.string().required("Name is required"),
  email: Yup.string()
    .email("Invalid email address")
    .required("Email is required"),
  subject: Yup.string().required("Subject is required"),
  message: Yup.string().required("Message is required"),
});

export default function ContributionPage() {
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
    <div className="min-h-screen bg-white  dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="py-20 text-center">
          <h1 className="text-5xl md:text-7xl font-extrabold mb-4 text-center bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent">
            Contribute to Our Vision
          </h1>
          <p className="text-xl md:text-2xl text-dark dark:text-white max-w-3xl mx-auto">
            Join us in shaping the future of open-source development and
            innovation
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-20 mb-20">
          <section className="space-y-8">
            <h2 className="text-3xl font-bold mb-6 border-b-2 border-white pb-2">
              Ways to Contribute
            </h2>
            <ul className="space-y-6">
              {[
                "Submit bug reports and feature requests",
                "Improve documentation",
                "Write and improve code",
                "Help with code reviews",
              ].map((item, index) => (
                <li key={index} className="flex items-center space-x-4 group">
                  <ArrowRight className="w-6 h-6 text-gray-400 group-hover:text-white transition-colors duration-300" />
                  <span className="text-lg group-hover:text-white transition-colors duration-300">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-8">
            <h2 className="text-3xl font-bold mb-6 border-b-2 border-white pb-2">
              Get in Touch
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
          </section>
        </div>

        <section className="mb-20">
          <h2 className="text-3xl font-bold mb-10 text-center border-b-2 border-white pb-2 inline-block">
            Our Community
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: "GitHub",
                icon: Github,
                description:
                  "Explore our repositories and contribute to the codebase.",
                link: "https://github.com/Insturance",
              },
              {
                title: "Twitter",
                icon: Twitter,
                description:
                  "Follow us for the latest updates and announcements.",
                link: "https://x.com/insturance_co",
              },
              {
                title: "LinkedIn",
                icon: Linkedin,
                description:
                  "Connect with us and stay updated on our professional network.",
                link: "https://www.linkedin.com/company/105046672/",
              },
              {
                title: "Instagram",
                icon: Instagram,
                description:
                  "Follow us for the latest updates and announcements.",
                link: "https://www.instagram.com/insturance_co/",
              },
            ].map((platform, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="h-full transition-all duration-300 ease-in-out transform hover:scale-105 hover:shadow-2xl bg-white border-2 border-black">
                  <CardHeader className="bg-black rounded-t-lg dark:bg-white">
                    <CardTitle className="flex items-center space-x-3 text-white">
                      <platform.icon className="w-8 h-8 dark:text-black" />
                      <span className="text-xl font-bold dark:text-black">
                        {platform.title}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <p className="text-lg text-black dark:text-white">
                      {platform.description}
                    </p>
                  </CardContent>
                  <div className="flex item-center justify-center">
                    <Button className="h-16 text-xl font-semibold bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-300 mb-4">
                      <Link
                        href={platform.link as string}
                        passHref
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Visit {platform.title}
                      </Link>
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        <section className=" bg-white dark:bg-black rounded-3xl">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="max-w-4xl mx-auto"
          >
            <h2 className="text-6xl font-bold mb-12 text-center bg-gradient-to-r from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent">
              Financial Contribution
            </h2>
            <div className="space-y-6 text-xl leading-relaxed text-black mb-12 dark:text-white">
              <p>
                Your financial support fuels our innovation and helps us
                maintain and improve our project. Every contribution, no matter
                the size, propels us forward.
              </p>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="max-w-2xl mx-auto"
          >
            <h3 className="text-3xl font-semibold mb-8 text-center text-black dark:text-white">
              Support Our Vision
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Button className="h-16 text-xl font-semibold ">
                <DollarSign className="mr-2 h-6 w-6" /> One-time Donation
              </Button>
              <Button className="h-16 text-xl font-semibold bg-black dark:bg-white">
                <Star className="mr-2 h-6 w-6" /> Become a Sponsor
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.2 }}
            className="mt-16 text-center"
          >
            <p className="text-2xl font-medium text-black dark:text-white">
              Join us in shaping the future of technology
            </p>
            <Heart className="h-12 w-12 mx-auto mt-4 text-[#ff2975]" />
          </motion.div>
        </section>
      </div>
    </div>
  );
}
