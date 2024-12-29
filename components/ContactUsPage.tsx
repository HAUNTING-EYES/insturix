"use client";

import { useFormik } from "formik";
import * as Yup from "yup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Send } from "lucide-react";
import { ToastAction } from "./ui/toast";

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
      }
      resetForm();
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 text-black">
      <Card className="w-full max-w-2xl shadow-lg border border-gray-200">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold">Contact Us</CardTitle>
          <CardDescription className="text-gray-600">
            We&apos;d love to hear from you. Send us a message!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={formik.handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
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
                  <div className="text-red-500 text-sm">
                    {formik.errors.name}
                  </div>
                )}
              </div>
              <div className="space-y-2">
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
                  <div className="text-red-500 text-sm">
                    {formik.errors.email}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="Message subject"
                {...formik.getFieldProps("subject")}
                className={
                  formik.touched.subject && formik.errors.subject
                    ? "border-red-500"
                    : ""
                }
              />
              {formik.touched.subject && formik.errors.subject && (
                <div className="text-red-500 text-sm">
                  {formik.errors.subject}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Your message"
                {...formik.getFieldProps("message")}
                className={`min-h-[100px] ${
                  formik.touched.message && formik.errors.message
                    ? "border-red-500"
                    : ""
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
              className="w-full bg-black text-white hover:bg-gray-800"
            >
              Send Message
              <Send className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
