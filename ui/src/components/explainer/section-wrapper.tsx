"use client";

import { motion, useReducedMotion } from "framer-motion";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface SectionWrapperProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}

export const SectionWrapper = forwardRef<HTMLElement, SectionWrapperProps>(
  function SectionWrapper({ id, children, className, wide }, ref) {
    const shouldReduceMotion = useReducedMotion();

    return (
      <section
        ref={ref}
        id={id}
        className={cn("relative py-24 md:py-32", className)}
      >
        <motion.div
          initial={
            shouldReduceMotion
              ? { opacity: 1 }
              : { opacity: 0, y: 30 }
          }
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={cn(
            "mx-auto px-6",
            wide ? "max-w-5xl" : "max-w-3xl"
          )}
        >
          {children}
        </motion.div>
      </section>
    );
  }
);
