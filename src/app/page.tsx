import { redirect } from "next/navigation";

// Root redirects to dashboard; auth middleware handles unauthenticated users
export default function Home() {
  redirect("/dashboard");
}
