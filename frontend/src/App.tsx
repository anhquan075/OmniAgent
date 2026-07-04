import CasperAgentDashboard from './components/dashboard/CasperAgentDashboard';

export default function App() {
  return (
    <div className="casper-shell relative min-h-[100dvh] w-full overflow-y-auto">
      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1760px] flex-col gap-4 p-1 sm:p-2">
        <main className="grid flex-1 grid-cols-1 items-stretch">
          <CasperAgentDashboard />
        </main>
      </div>
    </div>
  );
}
