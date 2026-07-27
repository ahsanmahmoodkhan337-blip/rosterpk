'use client';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  return (
    <>
      {/* Gold accent top bar */}
      <div className="h-1 bg-[#fad23b]" />

      {/* Header with logo and brand */}
      <header className="bg-[#1e5cd4] p-4 shadow-md">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="RosterDoc" className="h-8 w-auto" />
          <div>
            <h1 className="text-xl font-bold text-white">{title}</h1>
            {subtitle && (
              <p className="text-xs text-[#fad23b]">{subtitle}</p>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
