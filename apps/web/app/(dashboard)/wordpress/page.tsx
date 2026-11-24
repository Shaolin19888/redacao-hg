import { WordpressClient } from "@/components/wordpress/wordpress-client";

export default function WordpressPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WordPress</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Rascunhos e publicações no WordPress
        </p>
      </div>
      <WordpressClient />
    </div>
  );
}
