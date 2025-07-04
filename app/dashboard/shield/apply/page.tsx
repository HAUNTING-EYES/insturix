"use client";

import { useState } from "react";
import { Formik, Form, Field, ErrorMessage, FieldArray } from "formik";
import * as Yup from "yup";
import { useMutation } from "@tanstack/react-query";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Define the form steps
const STEPS = [
  "Creator Identity",
  "Platform Details",
  "Content & Brand",
  "Security History",
  "Legal & Content Risk",
  "Coverage Needs",
  "Declaration",
];

// Define the initial form values
const initialValues: FormValues = {
  // Creator Identity
  fullName: "",
  stageName: "",
  email: "",
  phone: "",
  location: "",
  primaryLanguage: "",

  // Platform Details
  platforms: [
    {
      platformName: "",
      username: "",
      followerCount: "",
      monthlyReach: "",
      engagementRate: "",
      profileLink: "",
    },
  ],

  // Content & Brand
  contentTypes: [],
  useCopyrightedMaterial: "",
  collaborateWithOthers: "",
  postsPerMonth: "",
  monetizationSources: [],
  otherMonetizationSource: "",

  // Security History
  hasBeenHacked: "",
  hackIncidentDescription: "",
  uses2FA: "",
  backupsContent: "",
  usesCyberProtection: "",

  // Legal & Content Risk
  receivedCopyrightStrike: "",
  copyrightStrikeDetails: "",
  facedHarassment: "",
  harassmentDetails: "",
  pendingLegalCases: "",
  watermarksContent: "",

  // Coverage Needs
  protectionNeeds: [],
  otherProtectionNeed: "",
  usedProtectionServicesBefore: "",
  worstOnlineIncident: "",

  // Declaration
  agreeToTruthfulness: false,
  agreeToContact: false,
};

// Define validation schema for each step
const validationSchemas = [
  // Step 1: Creator Identity
  Yup.object({
    fullName: Yup.string().required("Full name is required"),
    email: Yup.string()
      .email("Invalid email address")
      .required("Email is required"),
    phone: Yup.string().required("Phone number is required"),
    location: Yup.string().required("Location is required"),
    primaryLanguage: Yup.string().required("Primary language is required"),
  }),

  // Step 2: Platform Details
  Yup.object({
    platforms: Yup.array()
      .of(
        Yup.object({
          platformName: Yup.string().required("Platform name is required"),
          username: Yup.string().required("Username is required"),
          followerCount: Yup.number()
            .typeError("Must be a number")
            .required("Follower count is required"),
          monthlyReach: Yup.number()
            .typeError("Must be a number")
            .required("Monthly reach is required"),
          engagementRate: Yup.number()
            .typeError("Must be a number")
            .min(0, "Cannot be negative")
            .max(100, "Cannot exceed 100%")
            .required("Engagement rate is required"),
          profileLink: Yup.string()
            .url("Must be a valid URL")
            .required("Profile link is required"),
        })
      )
      .min(1, "At least one platform is required"),
  }),

  // Step 3: Content & Brand
  Yup.object({
    contentTypes: Yup.array()
      .min(1, "Select at least one content type")
      .required("Content type is required"),
    useCopyrightedMaterial: Yup.string().required("Please select an option"),
    collaborateWithOthers: Yup.string().required("Please select an option"),
    postsPerMonth: Yup.number()
      .typeError("Must be a number")
      .required("Posts per month is required"),
    monetizationSources: Yup.array().min(
      1,
      "Select at least one monetization source"
    ),
  }),

  // Step 4: Security History
  Yup.object({
    hasBeenHacked: Yup.string().required("Please select an option"),
    hackIncidentDescription: Yup.string().when("hasBeenHacked", {
      is: "Yes",
      then: (schema) => schema.required("Please describe the incident"),
    }),
    uses2FA: Yup.string().required("Please select an option"),
    backupsContent: Yup.string().required("Please select an option"),
    usesCyberProtection: Yup.string().required("Please select an option"),
  }),

  // Step 5: Legal & Content Risk
  Yup.object({
    receivedCopyrightStrike: Yup.string().required("Please select an option"),
    copyrightStrikeDetails: Yup.string().when("receivedCopyrightStrike", {
      is: "Yes",
      then: (schema) => schema.required("Please provide details"),
    }),
    facedHarassment: Yup.string().required("Please select an option"),
    harassmentDetails: Yup.string().when("facedHarassment", {
      is: "Yes",
      then: (schema) => schema.required("Please describe the harassment"),
    }),
    pendingLegalCases: Yup.string().required("Please select an option"),
    watermarksContent: Yup.string().required("Please select an option"),
  }),

  // Step 6: Coverage Needs
  Yup.object({
    protectionNeeds: Yup.array()
      .min(1, "Select at least one protection need")
      .required("Protection needs are required"),
    usedProtectionServicesBefore: Yup.string().required(
      "Please select an option"
    ),
    worstOnlineIncident: Yup.string().required(
      "Please describe your worst online incident"
    ),
  }),

  // Step 7: Declaration
  Yup.object({
    agreeToTruthfulness: Yup.boolean()
      .oneOf([true], "You must agree to this statement")
      .required("You must agree to this statement"),
    agreeToContact: Yup.boolean()
      .oneOf([true], "You must agree to this statement")
      .required("You must agree to this statement"),
  }),
];

// Content type options
const contentTypeOptions = [
  "Lifestyle",
  "Tech",
  "Comedy",
  "Finance",
  "Fashion",
  "Fitness",
  "Politics",
  "Education",
  "Other",
];

// Monetization source options
const monetizationOptions = [
  "YouTube ads",
  "Brand Deals",
  "Subscriptions",
  "Courses",
  "Donations",
  "Affiliate Marketing",
  "Merchandise",
  "Other",
];

// Protection needs options
const protectionNeedOptions = [
  "AI-based account monitoring",
  "Copyright/legal help",
  "Reputation management",
  "Insurance payout on account damage",
  "24/7 crisis team",
  "Other",
];

// Platform options
const platformOptions = [
  "Instagram",
  "YouTube",
  "TikTok",
  "X (Twitter)",
  "Facebook",
  "LinkedIn",
  "Twitch",
  "Pinterest",
  "Snapchat",
  "Reddit",
  "Other",
];

// Define type for the form data
interface FormValues {
  // Creator Identity
  fullName: string;
  stageName: string;
  email: string;
  phone: string;
  location: string;
  primaryLanguage: string;

  // Platform Details
  platforms: Array<{
    platformName: string;
    username: string;
    followerCount: string | number;
    monthlyReach: string | number;
    engagementRate: string | number;
    profileLink: string;
  }>;

  // Content & Brand
  contentTypes: string[];
  useCopyrightedMaterial: string;
  collaborateWithOthers: string;
  postsPerMonth: string | number;
  monetizationSources: string[];
  otherMonetizationSource: string;

  // Security History
  hasBeenHacked: string;
  hackIncidentDescription: string;
  uses2FA: string;
  backupsContent: string;
  usesCyberProtection: string;

  // Legal & Content Risk
  receivedCopyrightStrike: string;
  copyrightStrikeDetails: string;
  facedHarassment: string;
  harassmentDetails: string;
  pendingLegalCases: string;
  watermarksContent: string;

  // Coverage Needs
  protectionNeeds: string[];
  otherProtectionNeed: string;
  usedProtectionServicesBefore: string;
  worstOnlineIncident: string;

  // Declaration
  agreeToTruthfulness: boolean;
  agreeToContact: boolean;
}

// Function to submit form data to API
const submitFormData = async (formData: FormValues) => {
  // In a real application, this would be your API endpoint
  const response = await fetch("/api/services/shield", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(formData),
  });

  if (!response.ok) {
    throw new Error("Failed to submit application");
  }

  return response.json();
};

export default function CreatorApplicationForm() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState(initialValues);

  // React Query mutation for form submission
  const mutation = useMutation({
    mutationFn: submitFormData,
    onSuccess: () => {
      alert("Application submitted successfully!");
      setCurrentStep(0);
      setFormData(initialValues);
    },
    onError: (error) => {
      alert(
        "An error occurred while submitting the application: " + error.message
      );
    },
  });

  // Handle next step
  const handleNextStep = (values: FormValues) => {
    setFormData(values);
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    window.scrollTo(0, 0);
  };

  // Handle previous step
  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
    window.scrollTo(0, 0);
  };

  // Handle form submission
  const handleSubmit = async (values: FormValues) => {
    if (currentStep < STEPS.length - 1) {
      handleNextStep(values);
    } else {
      mutation.mutate(values);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex justify-between">
          {STEPS.map((step, index) => (
            <div
              key={index}
              className={`flex flex-col items-center ${index <= currentStep ? "text-primary" : "text-gray-400"}`}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  index <= currentStep
                    ? "bg-primary text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {index + 1}
              </div>
              <span className="mt-2 hidden text-xs sm:block">{step}</span>
            </div>
          ))}
        </div>
        <div className="relative mt-2">
          <div className="absolute h-1 w-full bg-gray-200"></div>
          <div
            className="absolute h-1 bg-primary transition-all duration-300"
            style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
          ></div>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-6 text-xl font-semibold">
            🧩 {currentStep + 1}. {STEPS[currentStep]}
          </h2>

          <Formik
            initialValues={formData}
            validationSchema={validationSchemas[currentStep]}
            onSubmit={handleSubmit}
          >
            {({ values, errors, touched, isSubmitting, setFieldValue }) => (
              <Form className="space-y-6">
                {/* Step 1: Creator Identity */}
                {currentStep === 0 && (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="fullName">Full Name</Label>
                      <Field
                        as={Input}
                        id="fullName"
                        name="fullName"
                        className={`${errors.fullName && touched.fullName ? "border-red-500" : ""}`}
                      />
                      <ErrorMessage
                        name="fullName"
                        component="div"
                        className="mt-1 text-sm text-red-500"
                      />
                    </div>

                    <div>
                      <Label htmlFor="stageName">
                        Stage Name (if applicable)
                      </Label>
                      <Field as={Input} id="stageName" name="stageName" />
                    </div>

                    <div>
                      <Label htmlFor="email">Email Address</Label>
                      <Field
                        as={Input}
                        id="email"
                        name="email"
                        type="email"
                        className={`${errors.email && touched.email ? "border-red-500" : ""}`}
                      />
                      <ErrorMessage
                        name="email"
                        component="div"
                        className="mt-1 text-sm text-red-500"
                      />
                    </div>

                    <div>
                      <Label htmlFor="phone">Phone Number</Label>
                      <Field
                        as={Input}
                        id="phone"
                        name="phone"
                        className={`${errors.phone && touched.phone ? "border-red-500" : ""}`}
                      />
                      <ErrorMessage
                        name="phone"
                        component="div"
                        className="mt-1 text-sm text-red-500"
                      />
                    </div>

                    <div>
                      <Label htmlFor="location">
                        Location (City, State, Country)
                      </Label>
                      <Field
                        as={Input}
                        id="location"
                        name="location"
                        className={`${errors.location && touched.location ? "border-red-500" : ""}`}
                      />
                      <ErrorMessage
                        name="location"
                        component="div"
                        className="mt-1 text-sm text-red-500"
                      />
                    </div>

                    <div>
                      <Label htmlFor="primaryLanguage">
                        Primary Language of Content
                      </Label>
                      <Field
                        as={Input}
                        id="primaryLanguage"
                        name="primaryLanguage"
                        className={`${errors.primaryLanguage && touched.primaryLanguage ? "border-red-500" : ""}`}
                      />
                      <ErrorMessage
                        name="primaryLanguage"
                        component="div"
                        className="mt-1 text-sm text-red-500"
                      />
                    </div>
                  </div>
                )}

                {/* Step 2: Platform Details */}
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <p className="text-sm text-gray-500">
                      For each platform where you create content, please provide
                      the following details:
                    </p>

                    <FieldArray name="platforms">
                      {({ remove, push }) => (
                        <div className="space-y-6">
                          {values.platforms.map((platform, index) => (
                            <div
                              key={index}
                              className="rounded-lg border border-gray-200 p-4"
                            >
                              <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-lg font-medium">
                                  Platform {index + 1}
                                </h3>
                                {values.platforms.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => remove(index)}
                                  >
                                    <Trash2 className="mr-1 h-4 w-4" />
                                    Remove
                                  </Button>
                                )}
                              </div>

                              <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                  <Label
                                    htmlFor={`platforms.${index}.platformName`}
                                  >
                                    Platform Name
                                  </Label>
                                  <div
                                    className={`${
                                      typeof errors.platforms?.[index] ===
                                        "object" &&
                                      "platformName" in
                                        (errors.platforms?.[index] || {}) &&
                                      touched.platforms?.[index]?.platformName
                                        ? "border-red-500"
                                        : ""
                                    }`}
                                  >
                                    <Select
                                      onValueChange={(value) =>
                                        setFieldValue(
                                          `platforms.${index}.platformName`,
                                          value
                                        )
                                      }
                                      value={platform.platformName}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select platform" />
                                      </SelectTrigger>
                                      <SelectContent className="bg-gray-800">
                                        {platformOptions.map((option) => (
                                          <SelectItem
                                            key={option}
                                            value={option}
                                          >
                                            {option}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <ErrorMessage
                                    name={`platforms.${index}.platformName`}
                                    component="div"
                                    className="mt-1 text-sm text-red-500"
                                  />
                                </div>

                                <div>
                                  <Label
                                    htmlFor={`platforms.${index}.username`}
                                  >
                                    Handle/Username
                                  </Label>
                                  <Field
                                    as={Input}
                                    id={`platforms.${index}.username`}
                                    name={`platforms.${index}.username`}
                                    className={`${
                                      typeof errors.platforms?.[index] ===
                                        "object" &&
                                      "username" in
                                        (errors.platforms?.[index] || {}) &&
                                      touched.platforms?.[index]?.username
                                        ? "border-red-500"
                                        : ""
                                    }`}
                                  />
                                  <ErrorMessage
                                    name={`platforms.${index}.username`}
                                    component="div"
                                    className="mt-1 text-sm text-red-500"
                                  />
                                </div>

                                <div>
                                  <Label
                                    htmlFor={`platforms.${index}.followerCount`}
                                  >
                                    Follower Count
                                  </Label>
                                  <Field
                                    as={Input}
                                    id={`platforms.${index}.followerCount`}
                                    name={`platforms.${index}.followerCount`}
                                    type="number"
                                    className={`${
                                      typeof errors.platforms?.[index] ===
                                        "object" &&
                                      "followerCount" in
                                        (errors.platforms?.[index] || {}) &&
                                      touched.platforms?.[index]?.followerCount
                                        ? "border-red-500"
                                        : ""
                                    }`}
                                  />
                                  <ErrorMessage
                                    name={`platforms.${index}.followerCount`}
                                    component="div"
                                    className="mt-1 text-sm text-red-500"
                                  />
                                </div>

                                <div>
                                  <Label
                                    htmlFor={`platforms.${index}.monthlyReach`}
                                  >
                                    Average Monthly Reach (Impressions)
                                  </Label>
                                  <Field
                                    as={Input}
                                    id={`platforms.${index}.monthlyReach`}
                                    name={`platforms.${index}.monthlyReach`}
                                    type="number"
                                    className={`${
                                      typeof errors.platforms?.[index] ===
                                        "object" &&
                                      "monthlyReach" in
                                        (errors.platforms?.[index] || {}) &&
                                      touched.platforms?.[index]?.monthlyReach
                                        ? "border-red-500"
                                        : ""
                                    }`}
                                  />
                                  <ErrorMessage
                                    name={`platforms.${index}.monthlyReach`}
                                    component="div"
                                    className="mt-1 text-sm text-red-500"
                                  />
                                </div>

                                <div>
                                  <Label
                                    htmlFor={`platforms.${index}.engagementRate`}
                                  >
                                    Average Engagement Rate (%)
                                  </Label>
                                  <Field
                                    as={Input}
                                    id={`platforms.${index}.engagementRate`}
                                    name={`platforms.${index}.engagementRate`}
                                    type="number"
                                    step="0.01"
                                    className={`${
                                      typeof errors.platforms?.[index] ===
                                        "object" &&
                                      "engagementRate" in
                                        (errors.platforms?.[index] || {}) &&
                                      touched.platforms?.[index]?.engagementRate
                                        ? "border-red-500"
                                        : ""
                                    }`}
                                  />
                                  <ErrorMessage
                                    name={`platforms.${index}.engagementRate`}
                                    component="div"
                                    className="mt-1 text-sm text-red-500"
                                  />
                                </div>

                                <div>
                                  <Label
                                    htmlFor={`platforms.${index}.profileLink`}
                                  >
                                    Link to Profile
                                  </Label>
                                  <Field
                                    as={Input}
                                    id={`platforms.${index}.profileLink`}
                                    name={`platforms.${index}.profileLink`}
                                    type="url"
                                    className={`${
                                      typeof errors.platforms?.[index] ===
                                        "object" &&
                                      "profileLink" in
                                        (errors.platforms?.[index] || {}) &&
                                      touched.platforms?.[index]?.profileLink
                                        ? "border-red-500"
                                        : ""
                                    }`}
                                  />
                                  <ErrorMessage
                                    name={`platforms.${index}.profileLink`}
                                    component="div"
                                    className="mt-1 text-sm text-red-500"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              push({
                                platformName: "",
                                username: "",
                                followerCount: "",
                                monthlyReach: "",
                                engagementRate: "",
                                profileLink: "",
                              })
                            }
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Another Platform
                          </Button>
                        </div>
                      )}
                    </FieldArray>
                  </div>
                )}

                {/* Step 3: Content & Brand */}
                {currentStep === 2 && (
                  <div className="space-y-6">
                    <div>
                      <Label className="mb-2 block">
                        Type of Content Created (Select all that apply)
                      </Label>
                      <div className="grid gap-2 md:grid-cols-3">
                        {contentTypeOptions.map((option) => (
                          <div
                            key={option}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={`contentType-${option}`}
                              checked={values.contentTypes.includes(option)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setFieldValue("contentTypes", [
                                    ...values.contentTypes,
                                    option,
                                  ]);
                                } else {
                                  setFieldValue(
                                    "contentTypes",
                                    values.contentTypes.filter(
                                      (type) => type !== option
                                    )
                                  );
                                }
                              }}
                            />
                            <Label
                              htmlFor={`contentType-${option}`}
                              className="text-sm font-normal"
                            >
                              {option}
                            </Label>
                          </div>
                        ))}
                      </div>
                      {errors.contentTypes && touched.contentTypes && (
                        <div className="mt-1 text-sm text-red-500">
                          {errors.contentTypes as string}
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="mb-2 block">
                        Do you use copyrighted material (music, clips, etc.)?
                      </Label>
                      <RadioGroup
                        value={values.useCopyrightedMaterial}
                        onValueChange={(value) =>
                          setFieldValue("useCopyrightedMaterial", value)
                        }
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Yes" id="copyright-yes" />
                          <Label
                            htmlFor="copyright-yes"
                            className="font-normal"
                          >
                            Yes
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="No" id="copyright-no" />
                          <Label htmlFor="copyright-no" className="font-normal">
                            No
                          </Label>
                        </div>
                      </RadioGroup>
                      {errors.useCopyrightedMaterial &&
                        touched.useCopyrightedMaterial && (
                          <div className="mt-1 text-sm text-red-500">
                            {errors.useCopyrightedMaterial}
                          </div>
                        )}
                    </div>

                    <div>
                      <Label className="mb-2 block">
                        Do you collaborate with other creators or brands?
                      </Label>
                      <RadioGroup
                        value={values.collaborateWithOthers}
                        onValueChange={(value) =>
                          setFieldValue("collaborateWithOthers", value)
                        }
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Yes" id="collaborate-yes" />
                          <Label
                            htmlFor="collaborate-yes"
                            className="font-normal"
                          >
                            Yes
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="No" id="collaborate-no" />
                          <Label
                            htmlFor="collaborate-no"
                            className="font-normal"
                          >
                            No
                          </Label>
                        </div>
                      </RadioGroup>
                      {errors.collaborateWithOthers &&
                        touched.collaborateWithOthers && (
                          <div className="mt-1 text-sm text-red-500">
                            {errors.collaborateWithOthers}
                          </div>
                        )}
                    </div>

                    <div>
                      <Label htmlFor="postsPerMonth">
                        Frequency of Posts per Month
                      </Label>
                      <Field
                        as={Input}
                        id="postsPerMonth"
                        name="postsPerMonth"
                        type="number"
                        className={`${errors.postsPerMonth && touched.postsPerMonth ? "border-red-500" : ""}`}
                      />
                      <ErrorMessage
                        name="postsPerMonth"
                        component="div"
                        className="mt-1 text-sm text-red-500"
                      />
                    </div>

                    <div>
                      <Label className="mb-2 block">
                        Monetization Sources (Select all that apply)
                      </Label>
                      <div className="grid gap-2 md:grid-cols-2">
                        {monetizationOptions.map((option) => (
                          <div
                            key={option}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={`monetization-${option}`}
                              checked={values.monetizationSources.includes(
                                option
                              )}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setFieldValue("monetizationSources", [
                                    ...values.monetizationSources,
                                    option,
                                  ]);
                                } else {
                                  setFieldValue(
                                    "monetizationSources",
                                    values.monetizationSources.filter(
                                      (source) => source !== option
                                    )
                                  );
                                }
                              }}
                            />
                            <Label
                              htmlFor={`monetization-${option}`}
                              className="text-sm font-normal"
                            >
                              {option}
                            </Label>
                          </div>
                        ))}
                      </div>
                      {errors.monetizationSources &&
                        touched.monetizationSources && (
                          <div className="mt-1 text-sm text-red-500">
                            {errors.monetizationSources as string}
                          </div>
                        )}
                    </div>

                    {values.monetizationSources.includes("Other") && (
                      <div>
                        <Label htmlFor="otherMonetizationSource">
                          Please specify other monetization source
                        </Label>
                        <Field
                          as={Input}
                          id="otherMonetizationSource"
                          name="otherMonetizationSource"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Step 4: Security History */}
                {currentStep === 3 && (
                  <div className="space-y-6">
                    <div>
                      <Label className="mb-2 block">
                        Have you ever been hacked?
                      </Label>
                      <RadioGroup
                        value={values.hasBeenHacked}
                        onValueChange={(value) =>
                          setFieldValue("hasBeenHacked", value)
                        }
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Yes" id="hacked-yes" />
                          <Label htmlFor="hacked-yes" className="font-normal">
                            Yes
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="No" id="hacked-no" />
                          <Label htmlFor="hacked-no" className="font-normal">
                            No
                          </Label>
                        </div>
                      </RadioGroup>
                      {errors.hasBeenHacked && touched.hasBeenHacked && (
                        <div className="mt-1 text-sm text-red-500">
                          {errors.hasBeenHacked}
                        </div>
                      )}
                    </div>

                    {values.hasBeenHacked === "Yes" && (
                      <div>
                        <Label htmlFor="hackIncidentDescription">
                          Describe the incident
                        </Label>
                        <Field
                          as={Textarea}
                          id="hackIncidentDescription"
                          name="hackIncidentDescription"
                          className={`${
                            errors.hackIncidentDescription &&
                            touched.hackIncidentDescription
                              ? "border-red-500"
                              : ""
                          }`}
                        />
                        <ErrorMessage
                          name="hackIncidentDescription"
                          component="div"
                          className="mt-1 text-sm text-red-500"
                        />
                      </div>
                    )}

                    <div>
                      <Label className="mb-2 block">
                        Do you use 2FA on all platforms?
                      </Label>
                      <RadioGroup
                        value={values.uses2FA}
                        onValueChange={(value) =>
                          setFieldValue("uses2FA", value)
                        }
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Yes" id="2fa-yes" />
                          <Label htmlFor="2fa-yes" className="font-normal">
                            Yes
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="No" id="2fa-no" />
                          <Label htmlFor="2fa-no" className="font-normal">
                            No
                          </Label>
                        </div>
                      </RadioGroup>
                      {errors.uses2FA && touched.uses2FA && (
                        <div className="mt-1 text-sm text-red-500">
                          {errors.uses2FA}
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="mb-2 block">
                        Do you regularly back up your content/data?
                      </Label>
                      <RadioGroup
                        value={values.backupsContent}
                        onValueChange={(value) =>
                          setFieldValue("backupsContent", value)
                        }
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Yes" id="backup-yes" />
                          <Label htmlFor="backup-yes" className="font-normal">
                            Yes
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="No" id="backup-no" />
                          <Label htmlFor="backup-no" className="font-normal">
                            No
                          </Label>
                        </div>
                      </RadioGroup>
                      {errors.backupsContent && touched.backupsContent && (
                        <div className="mt-1 text-sm text-red-500">
                          {errors.backupsContent}
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="mb-2 block">
                        Do you use any cyber protection tools or services?
                      </Label>
                      <RadioGroup
                        value={values.usesCyberProtection}
                        onValueChange={(value) =>
                          setFieldValue("usesCyberProtection", value)
                        }
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Yes" id="cyber-yes" />
                          <Label htmlFor="cyber-yes" className="font-normal">
                            Yes
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="No" id="cyber-no" />
                          <Label htmlFor="cyber-no" className="font-normal">
                            No
                          </Label>
                        </div>
                      </RadioGroup>
                      {errors.usesCyberProtection &&
                        touched.usesCyberProtection && (
                          <div className="mt-1 text-sm text-red-500">
                            {errors.usesCyberProtection}
                          </div>
                        )}
                    </div>
                  </div>
                )}

                {/* Step 5: Legal & Content Risk */}
                {currentStep === 4 && (
                  <div className="space-y-6">
                    <div>
                      <Label className="mb-2 block">
                        Have you ever received a copyright strike or takedown
                        notice?
                      </Label>
                      <RadioGroup
                        value={values.receivedCopyrightStrike}
                        onValueChange={(value) =>
                          setFieldValue("receivedCopyrightStrike", value)
                        }
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem
                            value="Yes"
                            id="copyright-strike-yes"
                          />
                          <Label
                            htmlFor="copyright-strike-yes"
                            className="font-normal"
                          >
                            Yes
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="No" id="copyright-strike-no" />
                          <Label
                            htmlFor="copyright-strike-no"
                            className="font-normal"
                          >
                            No
                          </Label>
                        </div>
                      </RadioGroup>
                      {errors.receivedCopyrightStrike &&
                        touched.receivedCopyrightStrike && (
                          <div className="mt-1 text-sm text-red-500">
                            {errors.receivedCopyrightStrike}
                          </div>
                        )}
                    </div>

                    {values.receivedCopyrightStrike === "Yes" && (
                      <div>
                        <Label htmlFor="copyrightStrikeDetails">
                          How many? What platforms?
                        </Label>
                        <Field
                          as={Textarea}
                          id="copyrightStrikeDetails"
                          name="copyrightStrikeDetails"
                          className={`${
                            errors.copyrightStrikeDetails &&
                            touched.copyrightStrikeDetails
                              ? "border-red-500"
                              : ""
                          }`}
                        />
                        <ErrorMessage
                          name="copyrightStrikeDetails"
                          component="div"
                          className="mt-1 text-sm text-red-500"
                        />
                      </div>
                    )}

                    <div>
                      <Label className="mb-2 block">
                        Have you ever faced online defamation, harassment, or
                        hate campaigns?
                      </Label>
                      <RadioGroup
                        value={values.facedHarassment}
                        onValueChange={(value) =>
                          setFieldValue("facedHarassment", value)
                        }
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Yes" id="harassment-yes" />
                          <Label
                            htmlFor="harassment-yes"
                            className="font-normal"
                          >
                            Yes
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="No" id="harassment-no" />
                          <Label
                            htmlFor="harassment-no"
                            className="font-normal"
                          >
                            No
                          </Label>
                        </div>
                      </RadioGroup>
                      {errors.facedHarassment && touched.facedHarassment && (
                        <div className="mt-1 text-sm text-red-500">
                          {errors.facedHarassment}
                        </div>
                      )}
                    </div>

                    {values.facedHarassment === "Yes" && (
                      <div>
                        <Label htmlFor="harassmentDetails">
                          Please describe.
                        </Label>
                        <Field
                          as={Textarea}
                          id="harassmentDetails"
                          name="harassmentDetails"
                          className={`${errors.harassmentDetails && touched.harassmentDetails ? "border-red-500" : ""}`}
                        />
                        <ErrorMessage
                          name="harassmentDetails"
                          component="div"
                          className="mt-1 text-sm text-red-500"
                        />
                      </div>
                    )}

                    <div>
                      <Label className="mb-2 block">
                        Any pending legal cases related to your content or
                        brand?
                      </Label>
                      <RadioGroup
                        value={values.pendingLegalCases}
                        onValueChange={(value) =>
                          setFieldValue("pendingLegalCases", value)
                        }
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Yes" id="legal-yes" />
                          <Label htmlFor="legal-yes" className="font-normal">
                            Yes
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="No" id="legal-no" />
                          <Label htmlFor="legal-no" className="font-normal">
                            No
                          </Label>
                        </div>
                      </RadioGroup>
                      {errors.pendingLegalCases &&
                        touched.pendingLegalCases && (
                          <div className="mt-1 text-sm text-red-500">
                            {errors.pendingLegalCases}
                          </div>
                        )}
                    </div>

                    <div>
                      <Label className="mb-2 block">
                        Do you watermark or license your content?
                      </Label>
                      <RadioGroup
                        value={values.watermarksContent}
                        onValueChange={(value) =>
                          setFieldValue("watermarksContent", value)
                        }
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Yes" id="watermark-yes" />
                          <Label
                            htmlFor="watermark-yes"
                            className="font-normal"
                          >
                            Yes
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="No" id="watermark-no" />
                          <Label htmlFor="watermark-no" className="font-normal">
                            No
                          </Label>
                        </div>
                      </RadioGroup>
                      {errors.watermarksContent &&
                        touched.watermarksContent && (
                          <div className="mt-1 text-sm text-red-500">
                            {errors.watermarksContent}
                          </div>
                        )}
                    </div>
                  </div>
                )}

                {/* Step 6: Coverage Needs */}
                {currentStep === 5 && (
                  <div className="space-y-6">
                    <div>
                      <Label className="mb-2 block">
                        What kind of protection do you need? (Select all that
                        apply)
                      </Label>
                      <div className="grid gap-2">
                        {protectionNeedOptions.map((option) => (
                          <div
                            key={option}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={`protection-${option}`}
                              checked={values.protectionNeeds.includes(option)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setFieldValue("protectionNeeds", [
                                    ...values.protectionNeeds,
                                    option,
                                  ]);
                                } else {
                                  setFieldValue(
                                    "protectionNeeds",
                                    values.protectionNeeds.filter(
                                      (need) => need !== option
                                    )
                                  );
                                }
                              }}
                            />
                            <Label
                              htmlFor={`protection-${option}`}
                              className="text-sm font-normal"
                            >
                              {option}
                            </Label>
                          </div>
                        ))}
                      </div>
                      {errors.protectionNeeds && touched.protectionNeeds && (
                        <div className="mt-1 text-sm text-red-500">
                          {errors.protectionNeeds as string}
                        </div>
                      )}
                    </div>

                    {values.protectionNeeds.includes("Other") && (
                      <div>
                        <Label htmlFor="otherProtectionNeed">
                          Please specify other protection need
                        </Label>
                        <Field
                          as={Input}
                          id="otherProtectionNeed"
                          name="otherProtectionNeed"
                        />
                      </div>
                    )}

                    <div>
                      <Label className="mb-2 block">
                        Have you used any creator insurance or protection
                        services before?
                      </Label>
                      <RadioGroup
                        value={values.usedProtectionServicesBefore}
                        onValueChange={(value) =>
                          setFieldValue("usedProtectionServicesBefore", value)
                        }
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Yes" id="services-yes" />
                          <Label htmlFor="services-yes" className="font-normal">
                            Yes
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="No" id="services-no" />
                          <Label htmlFor="services-no" className="font-normal">
                            No
                          </Label>
                        </div>
                      </RadioGroup>
                      {errors.usedProtectionServicesBefore &&
                        touched.usedProtectionServicesBefore && (
                          <div className="mt-1 text-sm text-red-500">
                            {errors.usedProtectionServicesBefore}
                          </div>
                        )}
                    </div>

                    <div>
                      <Label htmlFor="worstOnlineIncident">
                        What's the worst online incident you've faced
                        so far?
                      </Label>
                      <Field
                        as={Textarea}
                        id="worstOnlineIncident"
                        name="worstOnlineIncident"
                        className={`${
                          errors.worstOnlineIncident &&
                          touched.worstOnlineIncident
                            ? "border-red-500"
                            : ""
                        }`}
                      />
                      <ErrorMessage
                        name="worstOnlineIncident"
                        component="div"
                        className="mt-1 text-sm text-red-500"
                      />
                    </div>
                  </div>
                )}

                {/* Step 7: Declaration */}
                {currentStep === 6 && (
                  <div className="space-y-6">
                    <div className="rounded-lg border border-gray-200 bg-black-50 p-4">
                      <h3 className="mb-4 text-lg font-medium">Declaration</h3>
                      <div className="space-y-4">
                        <div className="flex items-start space-x-2">
                          <Checkbox
                            id="agreeToTruthfulness"
                            checked={values.agreeToTruthfulness}
                            onCheckedChange={(checked) =>
                              setFieldValue("agreeToTruthfulness", checked)
                            }
                          />
                          <Label
                            htmlFor="agreeToTruthfulness"
                            className="text-sm font-normal leading-tight"
                          >
                            I declare that the information provided is true and
                            complete to the best of my knowledge.
                          </Label>
                        </div>
                        {errors.agreeToTruthfulness &&
                          touched.agreeToTruthfulness && (
                            <div className="text-sm text-red-500">
                              {errors.agreeToTruthfulness}
                            </div>
                          )}

                        <div className="flex items-start space-x-2">
                          <Checkbox
                            id="agreeToContact"
                            checked={values.agreeToContact}
                            onCheckedChange={(checked) =>
                              setFieldValue("agreeToContact", checked)
                            }
                          />
                          <Label
                            htmlFor="agreeToContact"
                            className="text-sm font-normal leading-tight"
                          >
                            I agree to be contacted by the Insturix team for
                            further evaluation.
                          </Label>
                        </div>
                        {errors.agreeToContact && touched.agreeToContact && (
                          <div className="text-sm text-red-500">
                            {errors.agreeToContact}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation buttons */}
                <div className="flex justify-between pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePrevStep}
                    disabled={currentStep === 0}
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Previous
                  </Button>

                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {currentStep === STEPS.length - 1
                          ? "Submitting..."
                          : "Saving..."}
                      </>
                    ) : currentStep === STEPS.length - 1 ? (
                      <>Submit Application</>
                    ) : (
                      <>
                        Next
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>

                {/* Success message after submission */}
                {mutation.isSuccess && (
                  <div className="mt-6 rounded-lg bg-green-50 p-4 text-green-700">
                    <div className="flex">
                      <CheckCircle className="mr-2 h-5 w-5" />
                      <div>
                        <h3 className="font-medium">
                          Application Submitted Successfully!
                        </h3>
                        <p className="text-sm">
                          Thank you for your application. Our team will review
                          your information and contact you soon.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error message if submission fails */}
                {mutation.isError && (
                  <div className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">
                    <div className="flex">
                      <AlertCircle className="mr-2 h-5 w-5" />
                      <div>
                        <h3 className="font-medium">Submission Failed</h3>
                        <p className="text-sm">
                          {mutation.error instanceof Error
                            ? mutation.error.message
                            : "There was an error submitting your application. Please try again."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Form>
            )}
          </Formik>
        </CardContent>
      </Card>
    </div>
  );
}