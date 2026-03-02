import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

const variantStyles = {
  primary:
    "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200",
  secondary:
    "bg-black/10 text-neutral-700 hover:bg-black/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/20",
  ghost:
    "text-neutral-500 hover:text-neutral-900 hover:bg-black/5 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-white/5",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

const sizeStyles = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export default function Button({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-white/50 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
