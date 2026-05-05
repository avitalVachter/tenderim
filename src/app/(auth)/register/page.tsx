"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const schema = z.object({
  name: z.string().min(2, "שם חייב להכיל לפחות 2 תווים"),
  email: z.string().email("כתובת אימייל לא תקינה"),
  password: z.string().min(8, "סיסמה חייבת להכיל לפחות 8 תווים"),
});
type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setError(null);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "שגיאה בהרשמה, נסה שנית");
      return;
    }
    router.push("/login?registered=1");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm bg-card rounded-lg border border-border p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-center mb-6">יצירת חשבון</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">שם</label>
            <input
              {...register("name")}
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">אימייל</label>
            <input
              type="email"
              {...register("email")}
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              dir="ltr"
            />
            {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">סיסמה</label>
            <input
              type="password"
              {...register("password")}
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              dir="ltr"
            />
            {errors.password && <p className="text-destructive text-xs mt-1">{errors.password.message}</p>}
          </div>
          {error && <p className="text-destructive text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? "יוצר חשבון..." : "הרשמה"}
          </button>
        </form>
        <p className="text-sm text-center mt-4 text-muted-foreground">
          כבר יש לך חשבון?{" "}
          <Link href="/login" className="text-primary hover:underline">
            כניסה
          </Link>
        </p>
      </div>
    </div>
  );
}
