export interface ITask {
  name: string;
  execute(): Promise<void>;
}

export interface TaskResult {
  taskName: string;
  success: boolean;
  message: string;
  data?: any;
}
