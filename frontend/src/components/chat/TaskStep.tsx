import React from 'react';
import { CheckCircle2Icon, CircleIcon, Loader2Icon, AlertCircleIcon, ChevronRightIcon } from 'lucide-react';
import clsx from 'clsx';
import { Plan, PlanHeader, PlanTitle, PlanDescription, PlanContent } from '../ai-elements/Plan';
import { Task, TaskTrigger, TaskContent, TaskItem } from '../ai-elements/Task';

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

interface TaskStepProps {
  label: string;
  status: TaskStatus;
  details?: string;
}

export const TaskStep = ({ label, status, details }: TaskStepProps) => {
  const getIcon = () => {
    switch (status) {
      case 'completed': return <CheckCircle2Icon className="w-4 h-4 text-neon-green" />;
      case 'in-progress': return <Loader2Icon className="w-4 h-4 text-tether-teal animate-spin" />;
      case 'failed': return <AlertCircleIcon className="w-4 h-4 text-red-400" />;
      default: return <CircleIcon className="w-4 h-4 text-white/20" />;
    }
  };

  return (
    <Task defaultOpen={status === 'in-progress'} className="w-full">
      <div className={clsx(
        "flex flex-col gap-1 p-2 sm:p-3 rounded-xl transition-all duration-300",
        status === 'in-progress' ? "bg-tether-teal/10 shadow-glow-sm" : "bg-transparent"
      )}>
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">{getIcon()}</div>
          <span className={clsx(
            "text-[10px] font-heading font-bold tracking-widest uppercase",
            status === 'in-progress' ? "text-tether-teal" : (status === 'completed' ? "text-neon-green" : "text-neutral-gray")
          )}>
            {label}
          </span>
        </div>
        {details && (
          <p className="text-[9px] font-sans text-neutral-gray-light ml-7 opacity-70 leading-relaxed">
            {details}
          </p>
        )}
      </div>
    </Task>
  );
};

export const OperationalPlan = ({ steps }: { steps: TaskStepProps[] }) => {
  const activeStep = steps.find(s => s.status === 'in-progress') || steps[0];
  
  return (
    <Plan className="bg-transparent border-none p-0 mb-6">
      <PlanHeader className="p-0 mb-4 px-1">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3 bg-tether-teal rounded-full"></div>
          <PlanTitle className="text-[9px] font-heading font-black tracking-tighter text-tether-teal uppercase">
            Execution Roadmap
          </PlanTitle>
        </div>
        <PlanDescription className="text-[8px] text-neutral-gray uppercase mt-1">
          Autonomous Cycle Control Unit
        </PlanDescription>
      </PlanHeader>
      
      <PlanContent className="p-0 space-y-2">
        {steps.map((step, idx) => (
          <TaskStep key={idx} {...step} />
        ))}
      </PlanContent>
    </Plan>
  );
};
