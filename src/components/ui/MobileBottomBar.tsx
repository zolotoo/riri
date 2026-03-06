"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "../../utils/cn";
import type { LucideIcon } from "lucide-react";

export type MobileTabId = "dashboard" | "workspace" | "profile" | "menu";

interface TabItem {
  id: MobileTabId;
  icon: LucideIcon;
  label: string;
  iconColor: string;
}

interface MobileBottomBarProps extends React.HTMLAttributes<HTMLElement> {
  items: TabItem[];
  activeId: MobileTabId | null;
  onTabClick: (id: MobileTabId) => void;
}

const spring = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.85 };

export const MobileBottomBar = React.forwardRef<HTMLElement, MobileBottomBarProps>(
  ({ className, items, activeId, onTabClick, ...props }, ref) => {
    return (
      <nav
        ref={ref}
        data-floating="true"
        role="tablist"
        className={cn(
          "md:hidden fixed left-0 right-0 bottom-0 z-[9998]",
          "pointer-events-none flex justify-center",
          className
        )}
        style={{
          background: "transparent",
          border: "none",
          paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))",
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 8,
        }}
        {...props}
      >
        {/* iOS 17 frosted glass pill */}
        <div
          className="pointer-events-auto"
          style={{
            background: "rgba(248, 250, 255, 0.78)",
            backdropFilter: "blur(28px) saturate(170%)",
            WebkitBackdropFilter: "blur(28px) saturate(170%)",
            borderRadius: 34,
            border: "1px solid rgba(255,255,255,0.66)",
            boxShadow:
              "0 10px 30px rgba(11, 34, 64, 0.14), 0 2px 8px rgba(11, 34, 64, 0.08), inset 0 1px 0 rgba(255,255,255,0.86)",
            padding: "6px 4px",
          }}
        >
          <ul
            role="presentation"
            style={{ display: "flex", alignItems: "center", background: "transparent", border: "none", padding: 0, margin: 0, listStyle: "none" }}
          >
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeId;

              return (
                <li
                  key={item.id}
                  style={{ padding: 0, minHeight: "unset", borderRadius: 0, listStyle: "none" }}
                >
                  <motion.button
                    type="button"
                    aria-label={item.label}
                    aria-selected={isActive}
                    onClick={() => onTabClick(item.id)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 72,
                      paddingTop: 9,
                      paddingBottom: 9,
                      background: "transparent",
                      border: "none",
                      willChange: "transform",
                      minHeight: "unset",
                      minWidth: "unset",
                      cursor: "pointer",
                      WebkitTapHighlightColor: "transparent",
                      gap: 3,
                    }}
                    whileTap={{ scale: 0.87 }}
                    transition={spring}
                  >
                    <span
                      style={{
                        position: "relative",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 3,
                        borderRadius: 18,
                        padding: "4px 10px",
                      }}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="mobile-tab-active-pill"
                          transition={spring}
                          style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: 18,
                            background: "rgba(10, 132, 255, 0.14)",
                            border: "1px solid rgba(10, 132, 255, 0.25)",
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55)",
                          }}
                        />
                      )}
                      <Icon
                        style={{
                          width: 24,
                          height: 24,
                          color: isActive ? "#0a84ff" : "#8f94a3",
                          strokeWidth: isActive ? 2.1 : 1.75,
                          transition: "color 0.18s ease",
                          flexShrink: 0,
                          position: "relative",
                          zIndex: 1,
                        }}
                      />

                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: isActive ? 600 : 500,
                          letterSpacing: "-0.01em",
                          color: isActive ? "#0a84ff" : "#8f94a3",
                          lineHeight: 1,
                          transition: "color 0.18s ease, font-weight 0.18s ease",
                          whiteSpace: "nowrap",
                          position: "relative",
                          zIndex: 1,
                        }}
                      >
                        {item.label}
                      </span>
                    </span>
                  </motion.button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    );
  }
);

MobileBottomBar.displayName = "MobileBottomBar";
