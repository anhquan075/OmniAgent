import CasperAgentDashboard from './components/dashboard/CasperAgentDashboard';

export default function App() {
  return (
    <div className="casper-shell relative min-h-[100dvh] w-full overflow-y-auto">
      {/* Ambient background orbs */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 left-[10%] h-[500px] w-[500px] rounded-full opacity-[0.04] blur-[120px]"
          style={{ background: 'radial-gradient(circle, var(--color-casper-red) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-32 right-[5%] h-[400px] w-[400px] rounded-full opacity-[0.03] blur-[100px]"
          style={{ background: 'radial-gradient(circle, var(--color-casper-cream) 0%, transparent 70%)' }} />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1560px] flex-col gap-4 p-4 sm:p-5">
        <main className="grid flex-1 grid-cols-1 items-stretch">
          <CasperAgentDashboard />
        </main>
      </div>
    </div>
  );
}
