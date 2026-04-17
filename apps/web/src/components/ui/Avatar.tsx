// READY FOR QA
// Component: Avatar
// What was built: Circular avatar with image src or initials fallback, sizes sm/md/lg
// Edge cases: Initials derived from first letter of each word in name (max 2); graceful img error fallback

import { useState } from "react";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-10 w-10 text-base",
};

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ src, name, size = "md", className = "" }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = src && !imgError;

  return (
    <div
      aria-label={name}
      className={[
        "rounded-full flex items-center justify-center overflow-hidden shrink-0",
        "bg-surface-raised text-text-muted font-medium select-none",
        sizeClasses[size],
        className,
      ].join(" ")}
    >
      {showImage ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}
