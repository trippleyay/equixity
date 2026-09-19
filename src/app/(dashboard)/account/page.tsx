import { redirect } from "next/navigation";

/** The account page moved to Settings; old links keep working. */
export default function AccountRedirect() {
  redirect("/settings");
}
