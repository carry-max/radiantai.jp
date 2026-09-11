import { redirect } from "next/navigation";

export default function LegacyAccountPage() {
  redirect("/login");
}
