import { NextResponse } from "next/server";
import {
  freestyleDeploymentProvider,
  freestyleProjectStore,
} from "@/lib/adapters";
import { createFreestyleAccessContext } from "@/lib/application/access-control-service";
import { deploymentBelongsToProject } from "@/lib/application/deployment-ownership";
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await params;

  const productAccessError = await assertProductProjectAccess(repoId);
  if (productAccessError) return productAccessError;

  if (!(await assertRepoAccess(repoId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let deploymentId = "";
  try {
    const payload = (await req.json()) as { deploymentId?: string };
    deploymentId = payload?.deploymentId?.trim() ?? "";
  } catch {
    deploymentId = "";
  }

  if (!deploymentId) {
    return NextResponse.json(
      { error: "deploymentId is required" },
      { status: 400 },
    );
  }

  const metadata = await freestyleProjectStore.readMetadata(repoId);
  if (!metadata) {
    return NextResponse.json(
      { error: "Repository metadata not found" },
      { status: 404 },
    );
  }

  if (!metadata.productionDomain) {
    return NextResponse.json(
      { error: "Configure a production domain ending in .style.dev first" },
      { status: 400 },
    );
  }

  if (
    !(await deploymentBelongsToProject(metadata, deploymentId, (limit) =>
      freestyleDeploymentProvider.listDeployments(limit),
    ))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await freestyleDeploymentProvider.createDomainMapping({
    domain: metadata.productionDomain,
    deploymentId,
  });

  const nextMetadata =
    await freestyleProjectStore.promoteDeploymentToProduction({
      repoId,
      metadata,
      deploymentId,
    });

  return NextResponse.json({
    productionDomain: nextMetadata.productionDomain,
    productionDeploymentId: nextMetadata.productionDeploymentId,
  });
}
