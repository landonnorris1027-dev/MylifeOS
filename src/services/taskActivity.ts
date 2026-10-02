/** Shared protection for running and paused sessions, including hidden timer panels. */
let activeTaskIds = new Set<string>();
export const setActiveTaskIds = (ids: string[]) => { activeTaskIds = new Set(ids); };
export const isTaskActive = (id: string) => activeTaskIds.has(id);
export const assertTaskInactive = (id: string) => {
  if (isTaskActive(id)) throw new Error('End the active or paused session before changing this task.');
};
