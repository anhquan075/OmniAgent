import {
  ArrowRightLeft,
} from "lucide-react";
import BnbTradingAgentDashboard from "./components/dashboard/BnbTradingAgentDashboard";
import { DashboardCard } from "./components/dashboard/DashboardCard";
import HackathonShellHeader from "./components/dashboard/hackathon-shell-header";

export default function App() {
  return (
    <div className="bnb-cockpit-bg fixed inset-0 h-[100dvh] w-full overflow-hidden text-white">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1680px] flex-col gap-3 overflow-hidden p-3 md:p-4">
        <HackathonShellHeader />

        <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] items-stretch gap-3 overflow-hidden">
          <DashboardCard title="BNB Trading Agent" icon={ArrowRightLeft} className="h-full min-h-0 overflow-hidden">
            <BnbTradingAgentDashboard />
          </DashboardCard>
        </main>
      </div>
    </div>
  );
}
