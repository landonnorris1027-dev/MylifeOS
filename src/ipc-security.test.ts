import path from 'path';
import { pathToFileURL } from 'url';
import { isTrustedRendererUrl, validateIpcRequest } from './main/ipc-security';
import { WriteQueue } from './main/write-queue';
describe('desktop IPC boundaries', () => {
  it('allows only the owned entry document or configured local development origin', () => {
    const root = path.resolve('test-app'), entry = pathToFileURL(path.join(root, 'build/index.html')).href;
    expect(isTrustedRendererUrl(entry + '#planner', root)).toBe(true);
    expect(isTrustedRendererUrl('https://example.com/', root)).toBe(false);
    expect(isTrustedRendererUrl(pathToFileURL(path.join(root, 'secrets.json')).href, root)).toBe(false);
    expect(isTrustedRendererUrl('http://localhost:3000/', root, 'http://localhost:3000')).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:3001/', root, 'http://localhost:3000')).toBe(false);
  });
  it.each([
    ['pomodoro-start', { timerId: 'x', duration: Infinity, isFocusMode: true }],
    ['pomodoro-start', { timerId: 'x', duration: 60, isFocusMode: true, notificationsEnabled: 'yes' }],
    ['pomodoro-start', { timerId: 'x', duration: 60, isFocusMode: true, taskDate: 'bad' }],
    ['pomodoro-start', { timerId: 'x', duration: 60, isFocusMode: true, taskDate: '2026-02-30' }],
    ['storage-quit-ready', { requestId: 'old', ok: true }],
    ['pomodoro-stop', null], ['storage-write', { key: '__proto__', value: '{}' }],
    ['pomodoro-resolve-recovery', { recoveryId: 'x', action: 'delete-all' }],
    ['dialog-save-backup', { content: '{}', filename: '../backup.json' }],
  ])('rejects malformed %s before a mutation', (channel, payload) => {
    expect(() => validateIpcRequest(channel as string, payload)).toThrow('Invalid IPC');
  });
  it('orders accepted operations and drains even when an earlier operation fails', async () => {
    const queue = new WriteQueue(); const order: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = queue.enqueue(async () => { order.push('first'); await gate; throw Error('failed'); });
    const second = queue.enqueue(() => { order.push('second'); });
    void first.catch(() => undefined); await Promise.resolve(); expect(order).toEqual(['first']);
    release(); await expect(first).rejects.toThrow('failed'); await second; await queue.drain();
    expect(order).toEqual(['first', 'second']); expect(queue.pending).toBe(0);
  });
});
