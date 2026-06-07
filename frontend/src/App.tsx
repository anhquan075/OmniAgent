import BnbTradingAgentDashboard from "./components/dashboard/BnbTradingAgentDashboard";

export default function App() {
  return (
    <div className="bnb-cockpit-bg min-h-[100dvh] w-full overflow-y-auto text-white">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1740px] flex-col gap-2 p-2">
        <main className="grid flex-1 grid-cols-1 items-stretch gap-3">
          <BnbTradingAgentDashboard />
        </main>
      </div>
    </div>
  );
}
