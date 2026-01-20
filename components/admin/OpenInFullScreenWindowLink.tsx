"use client";

import Link from "next/link";
import React from "react";

export function OpenInFullScreenWindowLink(props: {
  href: string;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const { href, className, children, title } = props;

  return (
    <Link
      href={href}
      className={className}
      title={title}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </Link>
  );
}
