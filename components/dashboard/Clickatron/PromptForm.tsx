"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useGenerateThumbnail } from "@/lib/frontend/services/clickatron";
import { IClickatronTask } from "@/schemas/Clickatron";
import { Wand2, PenTool } from "lucide-react";
import { useGetStats } from "./hooks/useGetStats";
import { FormLock } from "./FormLock";

// Schema for guided mode
const guidedFormSchema = z.object({
  text: z.string().min(1, "Main text is required").max(50, "Text too long"),
  style: z.string().min(1, "Style is required"),
  mood: z.string().optional(),
  colors: z.string().optional(),
  subject: z.string().optional(),
  additionalDetails: z.string().optional(),
});

// Schema for freestyle mode
const freestyleFormSchema = z.object({
  details: z.string().min(10, "Please provide more details for the thumbnail.").max(1000),
});

interface PromptFormProps {
  onSubmit?: (taskId: string, task: Partial<IClickatronTask>) => void;
  onComplete?: (taskId: string, task: Partial<IClickatronTask>) => void;
  activeTasks?: Set<string>;
}

export function PromptForm({ onSubmit }: PromptFormProps) {
  const [activeTab, setActiveTab] = useState("guided");
  const { usage } = useGetStats();

  const guidedForm = useForm<z.infer<typeof guidedFormSchema>>({
    resolver: zodResolver(guidedFormSchema),
    defaultValues: {
      text: "",
      style: "",
      mood: "",
      colors: "",
      subject: "",
      additionalDetails: "",
    },
  });

  const freestyleForm = useForm<z.infer<typeof freestyleFormSchema>>({
    resolver: zodResolver(freestyleFormSchema),
    defaultValues: { details: "" },
  });

  const { mutate: generateThumbnail, isPending } = useGenerateThumbnail();

  const onGuidedSubmit = (values: z.infer<typeof guidedFormSchema>) => {
    // Create JSON string for guided mode
    const guidedData = Object.entries(values)
      .filter((entry) => {
        const value = entry[1];
        return value && value.trim() !== "";
      })
      .reduce((acc, entry) => {
        const key = entry[0] as keyof typeof values;
        const value = entry[1];
        return { ...acc, [key]: value };
      }, {} as Record<string, string>);
    
    const details = JSON.stringify(guidedData);
    
    generateThumbnail({ details }, {
      onSuccess: (newTask) => {
        onSubmit?.(newTask.taskId || newTask._id?.toString() || '', {
          title: guidedForm.getValues("text"),
          details: JSON.stringify(values),
          status: 'listed',
        });
        guidedForm.reset();
      },
    });
  };

  const onFreestyleSubmit = (values: z.infer<typeof freestyleFormSchema>) => {
    // Create JSON string for freestyle mode
    const details = JSON.stringify({ idea: values.details });
    
    generateThumbnail({ details }, {
      onSuccess: (newTask) => {
        onSubmit?.(newTask.taskId || newTask._id?.toString() || '', {
          title: "Freestyle Thumbnail",
          details: freestyleForm.getValues("details"),
          status: 'listed',
        });
        freestyleForm.reset();
      },
    });
  };


  const styles = [
    "Luxurious", "Minimalist", "Bold & Dramatic", "Vintage", "Modern", 
    "Cartoon/Illustrated", "Photorealistic", "Hand-drawn", "Neon", "Retro"
  ];

  const moods = [
    "Cinematic", "Energetic", "Calm", "Mysterious", "Exciting", 
    "Professional", "Fun", "Serious", "Inspirational", "Dark"
  ];

  const subjects = [
    "Person/Face", "Product", "Landscape", "Food", "Technology", 
    "Gaming", "Fitness", "Business", "Education", "Entertainment"
  ];

  return (
    <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl relative overflow-hidden">
      <CardContent className="pt-6">
        {usage && !usage.hasAccess && <FormLock timeUntilReset={usage.timeUntilReset} />}
        <div className={usage && !usage.hasAccess ? "blur-sm" : ""}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-black/20 h-10 sm:h-11">
              <TabsTrigger
                value="guided"
                className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900 text-xs sm:text-sm"
              >
                <Wand2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Smart Creator</span>
                <span className="sm:hidden">Smart</span>
              </TabsTrigger>
              <TabsTrigger
                value="freestyle"
                className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900 text-xs sm:text-sm"
              >
                <PenTool className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Freestyle</span>
                <span className="sm:hidden">Free</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="guided" className="mt-4 sm:mt-6">
              <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <p className="text-xs text-purple-200">
                  Smart Creator mode guides you through creating the perfect thumbnail with structured options.
                  You can type freely in natural language (e.g., &quot;None&quot;, &quot;Auto&quot;, &quot;Whatever works&quot;) or select from suggestions.
                  Only main text and style are required - other fields are optional to help refine your vision.
                </p>
              </div>
              
              <Form {...guidedForm}>
                <form onSubmit={guidedForm.handleSubmit(onGuidedSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={guidedForm.control}
                      name="text"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-zinc-300">Main Text *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., NIFTY 50, How to Cook"
                              className="bg-black/20 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={guidedForm.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-zinc-300">Subject</FormLabel>
                          <FormControl>
                            <div>
                              <Input
                                placeholder="Type or select subject"
                                className="bg-black/20 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500"
                                list="subjects"
                                {...field}
                              />
                              <datalist id="subjects">
                                {subjects.map((subject) => (
                                  <option key={subject} value={subject} />
                                ))}
                              </datalist>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={guidedForm.control}
                      name="style"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-zinc-300">Style *</FormLabel>
                          <FormControl>
                            <div>
                              <Input
                                placeholder="Type or select style"
                                className="bg-black/20 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500"
                                list="styles"
                                {...field}
                              />
                              <datalist id="styles">
                                {styles.map((style) => (
                                  <option key={style} value={style} />
                                ))}
                              </datalist>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={guidedForm.control}
                      name="mood"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-zinc-300">Mood</FormLabel>
                          <FormControl>
                            <div>
                              <Input
                                placeholder="Type or select mood"
                                className="bg-black/20 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500"
                                list="moods"
                                {...field}
                              />
                              <datalist id="moods">
                                {moods.map((mood) => (
                                  <option key={mood} value={mood} />
                                ))}
                              </datalist>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={guidedForm.control}
                    name="colors"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-zinc-300">Color Scheme</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Blue and gold, Red and black, Bright colors"
                            className="bg-black/20 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={guidedForm.control}
                    name="additionalDetails"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-zinc-300">Additional Details</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Any specific elements, effects, or requirements..."
                            className="bg-black/20 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500"
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    disabled={isPending || (usage && !usage.hasAccess)}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white border-0 h-12"
                  >
                    {isPending ? "Generating..." : "Generate Thumbnail"}
                  </Button>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="freestyle" className="mt-4 sm:mt-6">
              <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-xs text-blue-200">
                  Freestyle mode gives you complete creative control. Describe your thumbnail vision in detail
                  using natural language - the more specific you are, the better the results.
                </p>
              </div>
              
              <Form {...freestyleForm}>
                <form onSubmit={freestyleForm.handleSubmit(onFreestyleSubmit)} className="space-y-4">
                  <FormField
                    control={freestyleForm.control}
                    name="details"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-zinc-300">Describe your thumbnail</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="e.g., A vibrant thumbnail for a travel vlog about Japan, featuring Mount Fuji and cherry blossoms with bold yellow text saying 'JAPAN ADVENTURE' in a cinematic style with dramatic lighting."
                            className="bg-black/20 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500"
                            rows={6}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={isPending || (usage && !usage.hasAccess)}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white border-0 h-12"
                  >
                    {isPending ? "Generating..." : "Generate Thumbnail"}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
}