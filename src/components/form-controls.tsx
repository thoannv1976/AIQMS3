"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** <select> that submits its enclosing <form> as soon as the value changes. */
export function AutoSubmitSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={cn(
        "h-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
        className,
      )}
    />
  );
}

/** Submit button that asks for confirmation first (for deletes). */
export function ConfirmButton({
  message,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { message: string }) {
  return (
    <button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className={cn("text-xs text-red-600 hover:underline disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}
