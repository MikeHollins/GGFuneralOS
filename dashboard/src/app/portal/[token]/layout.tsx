import '../../../app/globals.css';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#faf5ef]">
      {/* No sidebar — standalone portal experience */}
      <header className="bg-[#1a1a2e] text-white px-4 py-3 text-center">
        <h1 className="text-sm font-bold text-[#c9a96e]">KC Golden Gate Funeral Home</h1>
        <p className="text-[10px] text-white/50">Secure Family Portal</p>
      </header>
      <main className="max-w-lg mx-auto px-4 py-6">{children}</main>
      <footer className="text-center text-[10px] text-gray-400 py-4">
        Your information is encrypted and secure.
      </footer>
    </div>
  );
}
