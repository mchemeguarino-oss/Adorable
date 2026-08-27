import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  freestyleConversationStore,
  freestyleProjectStore,
} from "@/lib/adapters";
import { createFreestyleAccessContext } from "@/lib/application/access-control-service";
import { getOrCreateIdentitySession } from "@/lib/identity-session";
import {
  assertProjectOwnership,
  AuthenticationRequiredError,
  type CurrentUser,
  ProjectOwnershipRequiredError,
  requireCurrentUser,
} from "@/lib/product-auth";

const assertRepoAccess = async (repoId: string) => {
  const { identityId, identity } = await getOrCreateIdentitySession();
  const access = createFreestyleAccessContext({
    identityId,
    identity,
  });
  return access.hasGitRepoAccess(repoId);
};

const assertProductProjectAccess = async (repoId: string) => {
  let currentUser: CurrentUser;
  try {
    currentUser = await requireCurrentUser();
    await assertProjectOwnership(currentUser.id, repoId);
  } catch (error) {
    if (
      error instanceof AuthenticationRequiredError ||
      error instanceof ProjectOwnershipRequiredError
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await params;

  const productAccessError = await assertProductProjectAccess(repoId);
  if (productAccessError) return productAccessError;

  if (!(await assertRepoAccess(repoId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const metadata = await freestyleProjectStore.readMetadata(repoId);
  if (!metadata) {
    return NextResponse.json(
      { error: "Repository metadata not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ conversations: metadata.conversations });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await params;

  let requestedTitle: string | undefined;
  try {
    const payload = (await req.json()) as { title?: string };
    const nextTitle = payload?.title?.trim();
    requestedTitle = nextTitle ? nextTitle : undefined;
  } catch {
    requestedTitle = undefined;
  }

  const productAccessError = await assertProductProjectAccess(repoId);
  if (productAccessError) return productAccessError;

  if (!(await assertRepoAccess(repoId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const metadata = await freestyleProjectStore.readMetadata(repoId);
  if (!metadata) {
    return NextResponse.json(
      { error: "Repository metadata not found" },
      { status: 404 },
    );
  }

  const conversationId = randomUUID();
  const next = await freestyleConversationStore.createConversation({
    repoId,
    metadata,
    conversationId,
    title: requestedTitle,
  });

  return NextResponse.json({
    conversationId,
    conversations: next.conversations,
  });
}
