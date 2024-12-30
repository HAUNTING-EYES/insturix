import { Lightbulb, Zap, BarChart, Lock } from "lucide-react";

const features = [
  {
    title: "Intelligent Automation",
    description: "Streamline your workflow with AI-powered automation.",
    icon: Zap,
  },
  {
    title: "Advanced Analytics",
    description: "Gain deeper insights with our cutting-edge analytics.",
    icon: BarChart,
  },
  {
    title: "Smart Predictions",
    description: "Make informed decisions with AI-driven predictions.",
    icon: Lightbulb,
  },
  {
    title: "Secure & Private",
    description: "Your data is protected with state-of-the-art security.",
    icon: Lock,
  },
];

export default function Features() {
  return (
    <section className="py-16 md:py-24 bg-black text-white">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          Powerful Features
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`p-6 rounded-lg transition-transform hover:scale-105 ${
                index % 2 === 0
                  ? "bg-white text-black"
                  : "bg-black text-white border border-white"
              }`}
            >
              <feature.icon className="h-12 w-12 mb-4" />
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
