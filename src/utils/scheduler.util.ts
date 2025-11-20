import * as cron from 'node-cron';
import { config } from '../config/env.config';
import { TaskRunner } from '../tasks/task-runner';

export class Scheduler {
  private taskRunner: TaskRunner;
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();

  constructor(taskRunner: TaskRunner) {
    this.taskRunner = taskRunner;
  }

  scheduleTask(taskName: string, cronExpression: string): void {
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const job = cron.schedule(cronExpression, async () => {
      console.log(`\n[SCHEDULED] Executing task: ${taskName}`);
      try {
        await this.taskRunner.executeTask(taskName);
      } catch (error) {
        console.error(`Scheduled task ${taskName} failed:`, error);
      }
    });

    this.cronJobs.set(taskName, job);
    console.log(`Scheduled task: ${taskName} with cron: ${cronExpression}`);
  }

  scheduleMovieScan(): void {
    this.scheduleTask('MovieScanTask', config.scanCronSchedule);
  }

  stopTask(taskName: string): void {
    const job = this.cronJobs.get(taskName);
    if (job) {
      job.stop();
      this.cronJobs.delete(taskName);
      console.log(`Stopped scheduled task: ${taskName}`);
    }
  }

  stopAll(): void {
    for (const [taskName, job] of this.cronJobs) {
      job.stop();
      console.log(`Stopped scheduled task: ${taskName}`);
    }
    this.cronJobs.clear();
  }
}
