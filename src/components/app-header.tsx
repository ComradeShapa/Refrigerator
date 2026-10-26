import { ArrowLeft, Settings } from "lucide-react";
import Link from "next/link";

type AppHeaderProps = {
  title: string;
  /** Если задан, слева показывается кнопка «Назад» вместо кнопки «Настройки». */
  backHref?: string;
};

const iconButtonClasses =
  "inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AppHeader({ title, backHref }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
        {backHref ? (
          <Link href={backHref} aria-label="Назад" className={iconButtonClasses}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        ) : (
          <span className="w-9" aria-hidden />
        )}
        <h1 className="truncate text-base font-semibold tracking-tight">
          {title}
        </h1>
        {backHref ? (
          <span className="w-9" aria-hidden />
        ) : (
          <Link
            href="/settings"
            aria-label="Настройки"
            className={iconButtonClasses}
          >
            <Settings className="h-5 w-5" />
          </Link>
        )}
      </div>
    </header>
  );
}
