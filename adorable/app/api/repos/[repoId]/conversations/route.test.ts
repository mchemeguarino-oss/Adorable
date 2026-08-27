import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockAuthenticationRequiredError extends Error {
    readonly status = 401;

    constructor(message = "Authentication required.") {
      super(message);
      this.name = "AuthenticationRequiredError";
    }
  }

  class MockProjectOwnershipRequiredError extends Error {
    readonly status = 403;

    constructor(message = "Forbidden") {
      super(message);
      this.name = "ProjectOwnershipRequiredError";
    }
  }

  return {
    AuthenticationRequiredError: MockAuthenticationRequiredError,
    ProjectOwnershipRequiredError: MockProjectOwnershipRequiredError,
    assertProjectOwnership: vi.fn(),
    createFreestyleAccessContext: vi.fn(),
    freestyleConversationStore: {
      createConversation: vi.fn(),
    },
    freestyleProjectStore: {
      readMetadata: vi.fn(),
    },
    getOrCreateIdentitySession: vi.fn(),
    requireCurrentUser: vi.fn(),
  };
});

vi.mock("@/lib/adapters", () => ({
  freestyleConversationStore: mocks.freestyleConversationStore,
  freestyleProjectStore: mocks.freestyleProjectStore,
}));

vi.mock("@/lib/application/access-control-service", () => ({
  createFreestyleAccessContext: mocks.createFreestyleAccessContext,
}));

vi.mock("@/lib/identity-session", () => ({
  getOrCreateIdentitySession: mocks.getOrCreateIdentitySession,
}));

vi.mock("@/lib/product-auth", () => ({
  assertProjectOwnership: mocks.assertProjectOwnership,
  AuthenticationRequiredError: mocks.AuthenticationRequiredError,
  ProjectOwnershipRequiredError: mocks.ProjectOwnershipRequiredError,
  requireCurrentUser: mocks.requireCurrentUser,
}));

const params = { params: Promise.resolve({ repoId: "wrapper-repo-id" }) };

describe("/api/repos/[repoId]/conversations ownership hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 before touching Freestyle when Supabase auth is missing", async () => {
    mocks.requireCurrentUser.mockRejectedValue(
      new mocks.AuthenticationRequiredError(),
    );

    const { GET } = await import("./route");
    const response = await GET(new Request("https://adorable.test"), params);

    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(response.status).toBe(401);
    expect(mocks.assertProjectOwnership).not.toHaveBeenCalled();
    expect(mocks.getOrCreateIdentitySession).not.toHaveBeenCalled();
    expect(mocks.freestyleProjectStore.readMetadata).not.toHaveBeenCalled();
  });

  it("returns 403 before touching Freestyle when the user does not own the project", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-id" });
    mocks.assertProjectOwnership.mockRejectedValue(
      new mocks.ProjectOwnershipRequiredError(),
    );

    const { GET } = await import("./route");
    const response = await GET(new Request("https://adorable.test"), params);

    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(response.status).toBe(403);
    expect(mocks.assertProjectOwnership).toHaveBeenCalledWith(
      "user-id",
      "wrapper-repo-id",
    );
    expect(mocks.getOrCreateIdentitySession).not.toHaveBeenCalled();
    expect(mocks.freestyleProjectStore.readMetadata).not.toHaveBeenCalled();
  });

  it("keeps the Freestyle AccessContext gate after Supabase ownership succeeds", async () => {
    const access = {
      hasGitRepoAccess: vi.fn().mockResolvedValue(false),
    };

    mocks.requireCurrentUser.mockResolvedValue({ id: "user-id" });
    mocks.assertProjectOwnership.mockResolvedValue(undefined);
    mocks.getOrCreateIdentitySession.mockResolvedValue({
      identityId: "legacy-identity-id",
      identity: { kind: "legacy-identity" },
    });
    mocks.createFreestyleAccessContext.mockReturnValue(access);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://adorable.test", {
        method: "POST",
        body: JSON.stringify({ title: "New conversation" }),
      }),
      params,
    );

    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(response.status).toBe(403);
    expect(mocks.assertProjectOwnership).toHaveBeenCalledWith(
      "user-id",
      "wrapper-repo-id",
    );
    expect(access.hasGitRepoAccess).toHaveBeenCalledWith("wrapper-repo-id");
    expect(
      mocks.assertProjectOwnership.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.getOrCreateIdentitySession.mock.invocationCallOrder[0]);
    expect(mocks.freestyleProjectStore.readMetadata).not.toHaveBeenCalled();
    expect(
      mocks.freestyleConversationStore.createConversation,
    ).not.toHaveBeenCalled();
  });
});
