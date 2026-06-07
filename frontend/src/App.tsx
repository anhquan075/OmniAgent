import BnbTradingAgentDashboard from "./components/dashboard/BnbTradingAgentDashboard";

export default function App() {
  return (
    <div className="bnb-cockpit-bg min-h-[100dvh] w-full overflow-y-auto text-white md:fixed md:inset-0 md:h-[100dvh] md:overflow-hidden">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1740px] flex-col gap-2 p-2 md:h-full md:min-h-0 md:overflow-hidden">
        <main className="grid flex-1 grid-cols-1 items-stretch gap-3 md:min-h-0 md:grid-rows-[minmax(0,1fr)] md:overflow-hidden">
          <BnbTradingAgentDashboard />
        </main>
      </div>
    </div>
  );
}
