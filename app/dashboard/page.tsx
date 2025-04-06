import Dashboard from "@/components/dashboard/Dashboard";
import CursorEffect from "@/components/ui/CursorEffect";
import DashboardShell from "@/components/dashboard/DashboardShell";
import DashboardCard, {
  DashboardCardGrid,
} from "@/components/dashboard/DashboardCard";

const THEME = {
  color: "rgba(255, 255, 255, 0.05)",
  gradient: {
    from: "from-white/40",
    to: "to-white/60",
  },
};

const products = [
  {
    name: "Alyzitron",
    path: "/dashboard/alyzitron",
    description: "Analytics and insights platform",
  },
  {
    name: "Editron",
    path: "/dashboard/editron",
    description: "Collaborative editing tools",
  },
  {
    name: "Kundli",
    path: "/dashboard/kundli",
    description: "Astrological calculations engine",
  },
  {
    name: "Meditron",
    path: "/dashboard/meditron",
    description: "Meditation and wellness tracker",
  },
  {
    name: "Shield",
    path: "/dashboard/shield",
    description: "Security and protection suite",
  },
  {
    name: "ThinkForge",
    path: "/dashboard/thinkforge",
    description: "AI-powered idea generation",
  },
  {
    name: "Musitron",
    path: "/dashboard/musitron",
    description: "Music analysis and insights platform",
  },
];

export default function DashboardPage() {
  return (
    <>
      <Dashboard />
      <CursorEffect variant="glow" color={THEME.color} size={500} blur={100} />
      <DashboardShell>
        <DashboardCardGrid>
          {products.map((product) => (
            <DashboardCard
              key={product.name}
              title={product.name}
              description={product.description}
              href={product.path}
            />
          ))}
        </DashboardCardGrid>
      </DashboardShell>
    </>
  );
}
