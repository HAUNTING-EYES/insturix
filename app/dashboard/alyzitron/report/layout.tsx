import React from 'react';

export default function ReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      {/* Content */}
      <div className="lg:pt-16">
        {children}
      </div>
    </div>
  );
}