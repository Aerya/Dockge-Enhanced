import cron from "node-cron";
import { getSchedulingTimezone, onSchedulingTimezoneChange } from "./scheduling-timezone";

/** Re-arm future ticks only. Changing zone never invokes a job or interrupts a running job. */
type ScheduleFactory = (expression: string, callback: () => void, options: { timezone: string }) => { stop: () => void };

export function scheduleInTimezone(expression: string, callback: () => void, schedule: ScheduleFactory = cron.schedule): { stop: () => void } {
    const create = () => schedule(expression, callback, { timezone: getSchedulingTimezone() });
    let task = create();
    const unsubscribe = onSchedulingTimezoneChange(() => {
        task.stop();
        task = create();
    });
    return { stop() {
        unsubscribe();
        task.stop();
    } };
}
