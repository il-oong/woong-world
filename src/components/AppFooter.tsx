export function AppFooter() {
  return (
    <footer className="px-4 py-4 text-center text-xs text-muted/70">
      v{process.env.NEXT_PUBLIC_APP_VERSION}
    </footer>
  );
}
