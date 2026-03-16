"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
}

export function GlowCard({ children, className }: GlowCardProps) {
  return (
    <motion.div
      whileHover={{
        boxShadow:
          "0 0 30px rgba(240, 185, 11, 0.25), 0 0 60px rgba(240, 185, 11, 0.1)",
        y: -4,
      }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "bg-bg-card border border-bnb-gold/20 rounded-2xl p-6",
        "transition-colors duration-300 hover:border-bnb-gold/40",
        "transform-gpu will-change-[transform,box-shadow]",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
