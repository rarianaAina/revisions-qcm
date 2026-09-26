import { NextResponse } from "next/server";
import { databaseReady } from "@/lib/db";
import { getLLMStatus } from "@/lib/llm";

export const dynamic = "force-dynamic";

/** Diagnostic de configuration affiché sur le tableau de bord. */
export async function GET() {
  return NextResponse.json({ llm: getLLMStatus(), database: await databaseReady() });
}
