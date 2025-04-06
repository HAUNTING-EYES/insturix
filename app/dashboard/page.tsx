import Dashboard from "@/components/dashboard/Dashboard";

export default function DashboardPage() {
  return (
    <>
<<<<<<< HEAD
      <Dashboard />
=======
      <CursorEffect variant="glow" color={THEME.color} size={500} blur={100} />
      <DashboardShell>
        {/* Dashboard Header */}
        <div
          className="mb-8 p-4 rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/[0.08]
                        shadow-[0_0_0_1px_rgba(255,255,255,0.02)]
                        hover:shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
        >
          <h1 className="text-3xl font-semibold tracking-tight text-white/90">
            Insturance Dashboard
          </h1>
          <p className="text-white/60 mt-2 text-lg font-light">
            Manage all your products and services from one place
          </p>
        </div>
        <DashboardCard.Grid>
          {products.map((product) => (
            <DashboardCard
              key={product.name}
              title={product.name}
              description={product.description}
              href={product.path}
            />
          ))}
        </DashboardCard.Grid>
      </DashboardShell>
>>>>>>> main
    </>
  );
}
