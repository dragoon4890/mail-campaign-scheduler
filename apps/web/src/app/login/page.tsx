"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { GoogleIcon } from "@/components/icons";

export default function LoginPage() {
  const [note, setNote] = useState<string | null>(null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-4">
      <div className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
        <h1 className="mb-8 text-center text-4xl font-bold text-gray-900">Login</h1>

        <button
          onClick={() => signIn("google", { redirectTo: "/" })}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-green-100 text-sm font-medium text-gray-800 hover:bg-green-200"
        >
          <GoogleIcon className="h-4 w-4" />
          Login with Google
        </button>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-xs text-gray-300">or sign up through email</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setNote("Email login is not enabled — use Google to continue.");
          }}
        >
          <input
            type="email"
            placeholder="Email ID"
            className="mb-3 h-11 w-full rounded-lg bg-gray-100 px-3 text-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-green-500"
          />
          <input
            type="password"
            placeholder="Password"
            className="mb-4 h-11 w-full rounded-lg bg-gray-100 px-3 text-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-green-500"
          />
          <button
            type="submit"
            className="h-11 w-full rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700"
          >
            Login
          </button>
        </form>

        {note && <p className="mt-4 text-center text-xs text-gray-400">{note}</p>}
      </div>
    </main>
  );
}
