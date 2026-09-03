import { apiError, requireUser } from "@/lib/auth/guard";

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request, undefined, { allowPasswordChange: true });
    return Response.json({ user });
  } catch (error) {
    return apiError(error);
  }
}
