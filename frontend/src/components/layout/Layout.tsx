"use client";

import * as React from "react";
import { Outlet, useLocation } from "react-router";
import { Sidebar } from "@/components/layout/Sidebar";

export function Layout() {
  const location = useLocation();
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="z-10">
          <Outlet context={{ location }} />
        </header>
        <main className="flex-1 overflow-y-auto bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
