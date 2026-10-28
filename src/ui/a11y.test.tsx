import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import axe from 'axe-core';
import {
  AlertDialog,
  Button,
  Dialog,
  Field,
  IconButton,
  Input,
  NumberField,
  Select,
  Switch,
  Toaster,
  clearToasts,
  toast,
} from './index';

type AxeResults = axe.AxeResults;

// axe probes icon ligatures through a 2d context; jsdom has no canvas, which
// would otherwise print a "Not implemented" warning on every run.
const originalGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = function stub() {
    return { measureText: () => ({ width: 0 }), fillText: () => undefined } as unknown as CanvasRenderingContext2D;
    // getContext is an overload set whose return type also covers WebGL and
    // ImageBitmap contexts; the stub only ever serves the 2d probe.
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

const runAxe = async (container: HTMLElement): Promise<AxeResults> => {
  const results = await axe.run(container, {
    // jsdom has no layout, so contrast and landmark rules cannot be evaluated.
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return results;
};

const summarize = (results: AxeResults) => results.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`);

describe('accessibility smoke', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    clearToasts();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('has no violations in the form primitives', async () => {
    await act(async () => {
      root.render(
        <form>
          <Field label="任务名称" description="最多 60 个字符" required>
            <Input defaultValue="" placeholder="名称" />
          </Field>
          <Field label="目标">
            <Select defaultValue="">
              <option value="">全部</option>
              <option value="g1">考研</option>
            </Select>
          </Field>
          <Field label="每日数量">
            <NumberField value={3} onChange={() => undefined} min={1} max={10} />
          </Field>
          <Field orientation="horizontal" label="提示音" description="结束后播放">
            <Switch defaultChecked />
          </Field>
          <Button type="submit">保存</Button>
          <IconButton aria-label="关闭"><span aria-hidden="true">x</span></IconButton>
        </form>,
      );
    });

    const results = await runAxe(container);
    expect(summarize(results)).toEqual([]);
  });

  it('has no violations in an open dialog', async () => {
    await act(async () => {
      root.render(
        <Dialog open onClose={() => undefined} title="临时任务" closeLabel="关闭">
          <Field label="名称"><Input defaultValue="" /></Field>
        </Dialog>,
      );
    });

    const results = await runAxe(container);
    expect(summarize(results)).toEqual([]);
  });

  it('has no violations in an alert dialog', async () => {
    await act(async () => {
      root.render(
        <AlertDialog
          open
          tone="danger"
          title="删除后不可恢复"
          message="这条记录会从今天移除。"
          confirmLabel="删除"
          cancelLabel="取消"
          onConfirm={() => undefined}
          onCancel={() => undefined}
        />,
      );
    });

    const results = await runAxe(container);
    expect(summarize(results)).toEqual([]);
  });

  it('flags an unlabelled control, so a green run means something', async () => {
    await act(async () => {
      root.render(<input defaultValue="" />);
    });

    const results = await runAxe(container);
    expect(results.violations.map((violation) => violation.id)).toContain('label');
  });

  it('has no violations in the toast viewport', async () => {
    await act(async () => {
      root.render(<Toaster />);
    });
    await act(async () => {
      toast({
        message: '晨间复盘',
        tone: 'info',
        assertive: true,
        duration: 0,
        action: { label: '撤销删除', onClick: () => undefined },
        closeLabel: '关闭',
      });
    });

    const results = await runAxe(container);
    expect(summarize(results)).toEqual([]);
  });
});