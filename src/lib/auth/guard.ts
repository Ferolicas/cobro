import "server-only";
import { auth, type CobroUser } from "@/lib/auth/auth";

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 401,
  ) {
    super(message);
  }
}

export async function requireUser(
  request: Request,
  roles?: CobroUser["role"][],
  options: { allowPasswordChange?: boolean } = {},
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new AuthError("Tu sesión ha expirado", 401);
  const user = session.user as unknown as CobroUser;
  if (!user.active) throw new AuthError("Usuario desactivado", 403);
  if (roles && !roles.includes(user.role)) throw new AuthError("No tienes permiso", 403);
  if (user.mustChangePassword && !options.allowPasswordChange) {
    throw new AuthError("Debes cambiar tu contraseña antes de continuar", 428);
  }
  return { session, user };
}

export function apiError(error: unknown) {
  if (error instanceof AuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Error inesperado";
  console.error(error);
  return Response.json({ error: message }, { status: 500 });
}
