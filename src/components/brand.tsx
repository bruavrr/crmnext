"use client";
import Image from "next/image";
import { useState } from "react";
import branding from "../../public/branding/brand.json";

/** Uses the official asset verbatim, without recoloring or reconstructing it. */
export default function Brand({ compact = false }: { compact?: boolean }) {
  const [missing, setMissing] = useState(false);
  return (
    <div className={`brand-lockup ${compact ? "compact" : ""}`}>
      {!missing && branding.logo && (
        <Image
          src={branding.logo || ""}
          alt="Next Gen Ads"
          width={640}
          height={640}
          priority
          unoptimized
          onError={() => setMissing(true)}
        />
      )}
    </div>
  );
}
