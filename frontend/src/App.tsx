import CasperAgentDashboard from './components/dashboard/CasperAgentDashboard';

export default function App() {
  return (
    <div className="casper-shell relative h-[100dvh] w-full overflow-hidden max-[1180px]:h-auto max-[1180px]:min-h-[100dvh] max-[1180px]:overflow-y-auto">
      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[1760px] flex-col gap-4 p-1 sm:p-2 pt-[max(0.25rem,env(safe-area-inset-top))] pb-[max(0.25rem,env(safe-area-inset-bottom))] pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))] max-[1180px]:h-auto max-[1180px]:min-h-[100dvh]">
        <main className="grid min-h-0 flex-1 grid-cols-1 items-stretch">
          <CasperAgentDashboard />
        </main>
      </div>
    </div>
  );
}
