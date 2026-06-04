import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-4xl font-bold text-copy-primary">Ghost AI</div>
      <Button variant="outline" className="ml-4">
        Get Started
      </Button>
    </main>
  );
}
