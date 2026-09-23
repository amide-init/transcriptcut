import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotFoundRoute() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-medium">Project not found</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        It may have been deleted, or the link is wrong.
      </p>
      <Button asChild size="sm" className="mt-2">
        <Link to="/">
          <ChevronLeft className="size-3.5" />
          Back to projects
        </Link>
      </Button>
    </div>
  );
}
