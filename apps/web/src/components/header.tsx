import { Separator } from "@framerfordevs/ui/components/separator";
import { Link } from "@tanstack/react-router";

import UserMenu from "./user-menu";

export default function Header() {
  const links = [
    { to: "/", label: "Framer for Devs" },
    { to: "/dashboard", label: "Projects" },
  ] satisfies ReadonlyArray<{
    readonly to: "/" | "/dashboard";
    readonly label: string;
  }>;

  return (
    <header>
      <div className="flex min-h-12 flex-row items-center justify-between px-4 sm:px-6">
        <nav className="flex items-center gap-4 text-sm" aria-label="Primary navigation">
          {links.map(({ to, label }) => {
            return (
              <Link
                key={to}
                to={to}
                activeProps={{ className: "font-medium" }}
                inactiveProps={{ className: "text-muted-foreground" }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <UserMenu />
        </div>
      </div>
      <Separator />
    </header>
  );
}
