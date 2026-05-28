"use client";

import dynamic from "next/dynamic";
import WelcomeSplash from "./WelcomeSplash";

const PrdiseApp = dynamic(() => import("./PrdiseApp"), {
  ssr: false,
  loading: () => <WelcomeSplash />,
});

export default function PrdiseAppLoader() {
  return <PrdiseApp />;
}
