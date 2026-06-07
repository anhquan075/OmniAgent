import {
  ArrowRightLeft,
} from "lucide-react";
import BnbTradingAgentDashboard from "./components/dashboard/BnbTradingAgentDashboard";
import { DashboardCard } from "./components/dashboard/DashboardCard";
import HackathonShellHeader from "./components/dashboard/hackathon-shell-header";

export default function App() {
  return (
    <div className="bnb-cockpit-bg min-h-[100dvh] w-full overflow-y-auto text-white md:fixed md:inset-0 md:h-[100dvh] md:overflow-hidden">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1680px] flex-col gap-3 p-3 md:h-full md:min-h-0 md:overflow-hidden md:p-4">
        <HackathonShellHeader />

        <main className="grid flex-1 grid-cols-1 items-stretch gap-3 md:min-h-0 md:grid-rows-[minmax(0,1fr)] md:overflow-hidden">
          <DashboardCard title="BNB Trading Agent" icon={ArrowRightLeft} className="md:h-full md:min-h-0 md:overflow-hidden">
            <BnbTradingAgentDashboard />
          </DashboardCard>
        </main>
      </div>
    </div>
  );
}
