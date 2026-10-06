import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { AppError } from "@/lib/db";
import CRM from "./crm";
export default async function Page() {
  try {
    await currentActor();
  } catch (e) {
    if (e instanceof AppError && e.status === 401) redirect("/login");
    throw e;
  }
  return <CRM />;
}
