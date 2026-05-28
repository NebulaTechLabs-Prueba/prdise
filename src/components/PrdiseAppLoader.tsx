"use client";

import dynamic from "next/dynamic";
import LoadingSplash from "./LoadingSplash";

const PrdiseApp = dynamic(() => import("./PrdiseApp"), {
  ssr: false,
  loading: () => <LoadingSplash />,
});

export default function PrdiseAppLoader() {
  return <PrdiseApp />;
}
