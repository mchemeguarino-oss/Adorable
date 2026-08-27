import { describe, expect, it } from "vitest";
import { isPublicAuthRoute } from "./root-frame";

describe("isPublicAuthRoute", () => {
  it("treats /login as public auth UI", () => {
    expect(isPublicAuthRoute("/login")).toBe(true);
  });

  it("treats /auth/callback as public auth infrastructure", () => {
    expect(isPublicAuthRoute("/auth/callback")).toBe(true);
  });

  it("treats /auth/logout as public auth infrastructure", () => {
    expect(isPublicAuthRoute("/auth/logout")).toBe(true);
  });

  it("keeps the home builder route behind the app shell", () => {
    expect(isPublicAuthRoute("/")).toBe(false);
  });

  it("keeps project routes behind the app shell", () => {
    expect(isPublicAuthRoute("/repo-id")).toBe(false);
  });
});
