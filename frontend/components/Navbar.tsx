"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { usePathname } from "next/navigation";

const links = [
  { href: '/dashboard',   label: 'Market'      },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/register',    label: 'Register'    },
];


export function Navbar() {
  const pathname = usePathname();

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 2rem', height: 60,
      borderBottom: '1px solid var(--border)',
      background: 'rgba(8,13,24,0.92)',
      backdropFilter: 'blur(16px)',
      boxShadow: '0 1px 0 rgba(245,158,11,0.06)',
    }}>
      <Link href="/" style={{
        fontFamily: 'var(--sans)', fontWeight: 800, fontSize: '1.1rem',
        letterSpacing: '0.18em', color: 'var(--amber)', textDecoration: 'none',
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        textShadow: '0 0 20px rgba(245,158,11,0.3)',
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--green)',
          display: 'inline-block',
          animation: 'pulse 2s ease-in-out infinite',
          boxShadow: '0 0 8px var(--green)',
        }} />
        AGON
      </Link>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
        {links.map(({ href, label }) => (
          <Link key={href} href={href} style={{
            color: pathname === href ? 'var(--amber)' : 'var(--muted-2)',
            textDecoration: 'none',
            fontFamily: 'var(--mono)',
            fontSize: '0.74rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            transition: 'color 0.2s',
            textShadow: pathname === href ? '0 0 12px rgba(245,158,11,0.3)' : 'none',
          }}>
            {label}
          </Link>
        ))}

      </div>
    </nav>
  );
}
