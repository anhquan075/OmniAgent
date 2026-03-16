"use client";

import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/animations";

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function SectionHeading({
  title,
  subtitle,
  icon,
  className = "",
}: SectionHeadingProps) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      className={`text-center mb-16 ${className}`}
    >
      {icon && (
        <span className="flex justify-center mb-4" aria-hidden="true">
          {icon}
        </span>
      )}
      <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
        <span
          style={{
            background: "linear-gradient(135deg, #F0B90B, #FFD966)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {title}
        </span>
      </h2>
      {subtitle && (
        <p className="text-neutral-gray-light text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
