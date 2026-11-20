import React from "react";
import "../blog.css";

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <>{children}</>;
}
