export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="mx-auto w-full max-w-[var(--container-max)] px-6">{children}</main>
  )
}
