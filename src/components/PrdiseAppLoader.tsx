"use client";

import dynamic from "next/dynamic";

const PrdiseApp = dynamic(() => import("./PrdiseApp"), { ssr: false });

export default function PrdiseAppLoader() {
  return <PrdiseApp />;
}
