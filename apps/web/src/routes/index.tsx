import { Badge } from "@framerfordevs/ui/components/badge";
import { Button } from "@framerfordevs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@framerfordevs/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRightIcon, BlocksIcon, CodeXmlIcon, LanguagesIcon } from "lucide-react";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const healthCheck = useQuery(orpc.healthCheck.queryOptions());

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-12 sm:px-6 sm:py-20">
      <section className="flex max-w-3xl flex-col items-start gap-5">
        <Badge variant="outline">Visual frontend infrastructure</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Structured content and website operations without giving up your stack.
        </h1>
        <p className="text-muted-foreground max-w-2xl text-lg text-pretty">
          Define stable project resources once, let clients edit safely, and keep ownership of your
          frontend, rendering, and infrastructure.
        </p>
        <Button size="lg" render={<Link to="/dashboard" />}>
          Open projects
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Product foundations">
        <FeatureCard
          icon={<CodeXmlIcon />}
          title="Developer owned"
          description="Use typed contracts while keeping your framework and deployment architecture."
        />
        <FeatureCard
          icon={<LanguagesIcon />}
          title="Localization first"
          description="Independent locale drafts and publication are part of the foundation."
        />
        <FeatureCard
          icon={<BlocksIcon />}
          title="Composable projects"
          description="Enable CMS and future capabilities without converting or migrating projects."
        />
      </section>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>API status</CardTitle>
          <CardDescription>Current application boundary health.</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant={healthCheck.data?.ok ? "default" : "secondary"}>
            {healthCheck.isLoading
              ? "Checking"
              : healthCheck.data?.ok
                ? "Connected"
                : "Unavailable"}
          </Badge>
        </CardContent>
      </Card>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div aria-hidden="true">{icon}</div>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{description}</p>
      </CardContent>
    </Card>
  );
}
