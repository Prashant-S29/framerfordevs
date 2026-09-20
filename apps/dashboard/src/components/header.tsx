import { env } from "@framerfordevs/env/dashboard";
import { Separator } from "@framerfordevs/ui/components/separator";
import { Link } from "@tanstack/react-router";

import UserMenu from "./auth/user-menu";

export default function Header() {
  return (
    <header>
      <div className="flex min-h-12 flex-row items-center justify-between px-4 sm:px-6">
        <nav className="flex items-center gap-4 text-sm" aria-label="Primary navigation">
          <a className="font-medium" href={env.VITE_MARKETING_ORIGIN}>
            Framer for Devs
          </a>
          <Link
            to="/dashboard"
            search={{ status: "active" }}
            activeProps={{ className: "font-medium" }}
            inactiveProps={{ className: "text-muted-foreground" }}
          >
            Projects
          </Link>
          <a className="text-muted-foreground" href={env.VITE_DEVELOPER_ORIGIN}>
            Docs
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <UserMenu />
        </div>
      </div>
      <Separator />
    </header>
  );
}
