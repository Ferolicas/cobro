import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type CobroUser } from "@/lib/auth/auth";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const user = session.user as unknown as CobroUser;
  redirect(user.mustChangePassword ? "/cambiar-clave" : "/app");
}
