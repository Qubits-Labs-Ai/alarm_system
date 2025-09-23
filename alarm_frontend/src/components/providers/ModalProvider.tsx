"use client";

import { useEffect, useState } from "react";
import { InsightModal } from "@/components/insights/InsightModal";

export const ModalProvider = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <>
      <InsightModal />
    </>
  );
};
