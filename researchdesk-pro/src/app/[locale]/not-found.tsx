import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container py-24 text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="mt-2 text-muted-foreground">Page not found · الصفحة غير موجودة</p>
      <Link href="/" className={buttonClass("outline", "md", "mt-6")}>
        ResearchDesk Pro
      </Link>
    </div>
  );
}
