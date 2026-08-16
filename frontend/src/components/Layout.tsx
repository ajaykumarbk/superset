// frontend/src/components/Layout.tsx
// Shared layout wrapper — currently passes children through.
// Extend this to add a persistent nav bar, toast system, etc.
import React from 'react';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="table-glow-overlay" />
      <div className="app-container">{children}</div>
    </>
  );
}
