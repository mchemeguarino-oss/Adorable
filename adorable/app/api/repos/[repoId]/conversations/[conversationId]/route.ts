import { NextResponse } from "next/server";
import { freestyleConversationStore } from "@/lib/adapters";
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
  { params }: { params: Promise<{ repoId: string; conversationId: string }> },
) {
  const { repoId, conversationId } = await params;

  const productAccessError = await assertProductProjectAccess(repoId);
  if (productAccessError) return productAccessError;

  if (!(await assertRepoAccess(repoId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const messages = await freestyleConversationStore.readMessages(
    repoId,
    conversationId,
  );
  return NextResponse.json({ messages });
}
