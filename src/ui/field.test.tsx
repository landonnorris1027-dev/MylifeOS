import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Field, Input, InputGroup, NumberField, Switch, Textarea } from './index';

const setNativeValue = (element: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
};

const press = async (button: Element) => {
  await act(async () => {
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    button.dispatchEvent(new Event('pointerup', { bubbles: true }));
  });
};

describe('form primitives', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('wires label, description and error to the control', async () => {
    await act(async () => {
      root.render(
        <Field label="名称" description="最多 60 字" error="名称重复" required>
          <Input defaultValue="" />
        </Field>,
      );
    });

    const label = container.querySelector('label') as HTMLLabelElement;
    const input = container.querySelector('input') as HTMLInputElement;
    const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? [];

    expect(input.id).not.toBe('');
    expect(label.htmlFor).toBe(input.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy).toHaveLength(2);
    expect(document.getElementById(describedBy[0])?.textContent).toBe('最多 60 字');
    expect(document.getElementById(describedBy[1])?.textContent).toBe('名称重复');
  });

  it('labels a switch through <Field> so the row is clickable', async () => {
    await act(async () => {
      root.render(
        <Field orientation="horizontal" label="提示音" description="结束后播放提示">
          <Switch defaultChecked />
        </Field>,
      );
    });

    const label = container.querySelector('label') as HTMLLabelElement;
    const control = container.querySelector('[role="switch"]') as HTMLInputElement;

    expect(control.id).not.toBe('');
    expect(label.htmlFor).toBe(control.id);
    expect(control.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(control.getAttribute('aria-describedby')!)?.textContent).toBe('结束后播放提示');
  });

  it('keeps typed digits intact and clamps only on blur', async () => {
    const seen: Array<number | ''> = [];
    const Harness: React.FC = () => {
      const [value, setValue] = useState<number | ''>(5);
      return (
        <NumberField
          value={value}
          onChange={(next) => { seen.push(next); setValue(next); }}
          min={1}
          max={10}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      setNativeValue(input, '99');
    });
    expect(input.value).toBe('99');

    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(input.value).toBe('10');
    expect(seen[seen.length - 1]).toBe(10);
  });

  it('steps with the buttons and stops at the bounds', async () => {
    const Harness: React.FC = () => {
      const [value, setValue] = useState<number | ''>(9);
      return <NumberField value={value} onChange={setValue} min={1} max={10} />;
    };

    await act(async () => {
      root.render(<Harness />);
    });

    const buttons = container.querySelectorAll('button');
    await press(buttons[1]);
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('10');

    const after = container.querySelectorAll('button');
    expect((after[1] as HTMLButtonElement).disabled).toBe(true);
    await press(after[0]);
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('9');
  });

  it('keeps affixes out of the reading order and honours the suffix unit', async () => {
    await act(async () => {
      root.render(
        <InputGroup prefix={<span data-testid="icon">icon</span>} suffix="小时">
          <Textarea rows={2} defaultValue="" />
        </InputGroup>,
      );
    });

    const prefix = container.querySelector('[data-side="prefix"]') as HTMLElement;
    const suffix = container.querySelector('[data-side="suffix"]') as HTMLElement;
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;

    expect(prefix.getAttribute('aria-hidden')).toBe('true');
    expect(suffix.getAttribute('aria-hidden')).toBeNull();
    expect(suffix.textContent).toBe('小时');
    expect(textarea.getAttribute('aria-describedby')).toBeNull();
  });
});
