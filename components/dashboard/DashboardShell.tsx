"use client";
interface DashboardShellProps {
    children: React.ReactNode;
}

export default function DashboardShell({
    children,
}: DashboardShellProps) {
    return (
        <div className="container mx-auto px-4 py-8">
            <div id="dashboard-content-area">
                {children}
            </div>
        </div>
    );
}