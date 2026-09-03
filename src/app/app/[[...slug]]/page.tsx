import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CrmShell } from "@/components/crm/CrmShell";
import { auth, type CobroUser } from "@/lib/auth/auth";

export default async function AppPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const user = session.user as unknown as CobroUser;
  if (user.mustChangePassword) redirect("/cambiar-clave");
  if (!user.active) redirect("/login");
  const { slug = [] } = await params;
  return <CrmShell user={user} slug={slug}/>;
}
