import { z } from "zod";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  try {
    await requireUser(request);
    return Response.json({ zones: await prisma.zone.findMany({ where: { active: true }, orderBy: { name: "asc" } }) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    await requireUser(request, ["MASTER"]);
    const { name } = z.object({ name: z.string().trim().min(2).max(100) }).parse(await request.json());
    return Response.json({ zone: await prisma.zone.create({ data: { name } }) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
