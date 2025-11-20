import { ITask } from '../types/task.types';

export class TaskRunner {
  private tasks: Map<string, ITask> = new Map();

  registerTask(task: ITask): void {
    this.tasks.set(task.name, task);
    console.log(`Task registered: ${task.name}`);
  }

  async executeTask(taskName: string): Promise<void> {
    const task = this.tasks.get(taskName);

    if (!task) {
      throw new Error(`Task not found: ${taskName}`);
    }

    await task.execute();
  }

  async executeAllTasks(): Promise<void> {
    for (const [name, task] of this.tasks) {
      console.log(`Executing task: ${name}`);
      try {
        await task.execute();
      } catch (error) {
        console.error(`Task ${name} failed:`, error);
      }
    }
  }

  getRegisteredTasks(): string[] {
    return Array.from(this.tasks.keys());
  }
}
