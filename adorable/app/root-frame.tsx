"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { WorkspaceFrame } from "./workspace-frame";
import { ApiKeyGate } from "@/components/api-key-gate";

export const isPublicAuthRoute = (pathname: string) =>
  pathname === "/login" ||
  pathname === "/auth" ||
  pathname.startsWith("/auth/");

export function RootFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isPublicAuthRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <ApiKeyGate>
      <WorkspaceFrame>{children}</WorkspaceFrame>
    </ApiKeyGate>
  );
}
