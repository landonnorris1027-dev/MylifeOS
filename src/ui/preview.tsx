import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Bell, CheckCircle2, Coffee, Download, FileText, Minimize2, Search, Target, Volume2, X, XCircle } from 'lucide-react';
import '../index.css';
import '../ui-motion.css';
import {
  Button,
  Toaster,
  toast,
  Checkbox,
  CheckboxChip,
  Field,
  FieldGroup,
  FieldLegend,
  FieldSet,
  IconButton,
  Input,
  InputGroup,
  NumberField,
  Select,
  Switch,
  Textarea,
} from './index';

const Section: React.FC<{ id?: string; title: string; note?: string; children: React.ReactNode }> = ({ id, title, note, children }) => (
  <section id={id} className="mb-10 scroll-mt-8">
    <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
    {note ? <p className="mb-4 text-xs text-gray-500">{note}</p> : <div className="mb-4" />}
    {children}
  </section>
);

const Cell: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
    {children}
  </div>
);

const Preview: React.FC = () => {
  const [name, setName] = useState('晚间复盘');
  const [goal, setGoal] = useState('');
  const [note, setNote] = useState('');
  const [quota, setQuota] = useState<number | ''>(3);
  const [hours, setHours] = useState<number | ''>(12);
  const [minutes, setMinutes] = useState<number | ''>(30);
  const [sound, setSound] = useState(true);
  const [notify, setNotify] = useState(false);
  const [tray, setTray] = useState(true);
  const [days, setDays] = useState<number[]>([0, 2, 4]);
  const [status, setStatus] = useState('scheduled');
  const [priority, setPriority] = useState('P1');
  const [email, setEmail] = useState('not-an-email');
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    const only = new URLSearchParams(window.location.search).get('only');
    if (only) {
      document.querySelectorAll('main > section').forEach((element) => {
        if (element.id && element.id !== only) (element as HTMLElement).style.display = 'none';
      });
    }
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, []);

  return (
    <main className="mx-auto max-w-[1080px] px-8 py-10">
      <header className="mb-10 border-b border-gray-200 pb-6">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">B1 – B4 · 原语审阅</p>
        <h1 className="text-2xl font-semibold text-[#1f2937]">按钮与表单控件层</h1>
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-gray-600">
          Button / IconButton 收口所有动作按钮，Field 负责 label / 描述 / 错误与 ARIA 串联，Input · Textarea ·
          InputGroup · Select · NumberField · Switch · Checkbox 共用同一套控件皮肤。全部可交互：输入、点按、键盘
          Tab 都能试。
        </p>
      </header>

      <Section id="buttons" title="按钮族（B1 + B2）" note="6 个变体 × 3 档尺寸，全部走同一套 token；图标按钮的 aria-label 由类型强制必填。">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button>保存</Button>
          <Button variant="secondary">取消</Button>
          <Button variant="ghost">稍后</Button>
          <Button variant="danger">删除</Button>
          <Button variant="info">看看再说</Button>
          <Button variant="success">标记完成</Button>
        </div>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button size="sm">小号 32</Button>
          <Button>中号 40</Button>
          <Button size="lg">大号 48</Button>
          <Button disabled>禁用</Button>
          <Button loading>处理中</Button>
          <Button variant="secondary"><Download size={15} aria-hidden="true" />带图标</Button>
        </div>
        <div className="mb-6 flex flex-wrap items-center gap-6 rounded-xl bg-white px-4 py-3">
          <span className="text-xs text-gray-500">图标按钮：</span>
          {([['sm', 14, 30], ['md', 16, 36], ['lg', 18, 44]] as const).map(([size, icon, px]) => (
            <div key={size} className="flex flex-col items-center gap-1">
              <IconButton aria-label={`图标按钮 ${size}`} size={size} variant="secondary"><X size={icon} /></IconButton>
              <span className="text-[10px] text-gray-400">{size} · {px}px</span>
            </div>
          ))}
          <div className="flex flex-col items-center gap-1">
            <IconButton aria-label="危险操作" variant="danger"><X size={16} /></IconButton>
            <span className="text-[10px] text-gray-400">danger</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <IconButton aria-label="无底色" variant="ghost"><X size={16} /></IconButton>
            <span className="text-[10px] text-gray-400">ghost</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">确认弹窗动作区</p>
            <div className="flex gap-3">
              <Button variant="secondary" size="lg" className="flex-1">取消</Button>
              <Button size="lg" className="flex-1">确认</Button>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">恢复弹窗动作区</p>
            <div className="space-y-2">
              <Button variant="info" size="lg" block>稍后提醒</Button>
              <Button size="lg" block><Coffee size={18} aria-hidden="true" />开始休息</Button>
              <Button variant="success" size="lg" block><CheckCircle2 size={18} aria-hidden="true" />标记任务完成</Button>
              <Button variant="secondary" size="lg" block><XCircle size={18} aria-hidden="true" />放弃本次</Button>
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">单按钮弹窗</p>
          <Button size="lg" block>我明白了</Button>
        </div>
      </Section>

      <Section id="toast" title="提示条（C3）" note="队列上限 3、默认 5 秒、hover/focus 暂停；带动作的提示用 assertive 播报。点按钮试。">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast({ message: '已保存到本地', tone: 'success', closeLabel: '关闭' })}>
            成功提示
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({
              message: '晨间复盘',
              tone: 'info',
              assertive: true,
              duration: 0,
              action: { label: '撤销删除', onClick: () => toast({ message: '已恢复到收件箱', tone: 'success' }) },
              closeLabel: '关闭',
            })}
          >
            Undo 条（常驻）
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({
              message: '备份完成',
              description: 'mylifeos_backup_2026-10-28.json',
              tone: 'success',
              closeLabel: '关闭',
            })}
          >
            带副文案
          </Button>
          <Button
            variant="danger"
            onClick={() => { toast({ message: '导入失败', tone: 'danger', closeLabel: '关闭' }); toast({ message: '第二条', tone: 'info', closeLabel: '关闭' }); toast({ message: '第三条', tone: 'info', closeLabel: '关闭' }); toast({ message: '第四条会挤掉第一条', tone: 'info', closeLabel: '关闭' }); }}
          >
            连发四条（验证上限）
          </Button>
        </div>
        <Toaster />
      </Section>

      <Section id="field" title="Field 解剖" note="label htmlFor、描述与错误通过 aria-describedby 自动串联；错误态整块变红。">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Field label="任务名称" description="最多 60 个字符" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：整理周报" />
          </Field>
          <Field label="邮箱" error="请输入有效的邮箱地址" invalid>
            <Input value={email} onChange={(event) => setEmail(event.target.value)} type="text" />
          </Field>
          <Field label="禁用状态" description="这一项由系统锁定">
            <Input value="不可编辑" disabled readOnly />
          </Field>
        </div>
      </Section>

      <Section id="matrix" title="控件状态矩阵" note="同一套 .ui-control，六种常见形态，互不打架。">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Cell label="默认">
            <Input placeholder="输入内容" />
          </Cell>
          <Cell label="前缀图标（输入框组）">
            <InputGroup prefix={<Target size={15} />}>
              <Input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="选择或输入目标" />
            </InputGroup>
          </Cell>
          <Cell label="后缀单位">
            <InputGroup suffix="小时">
              <Input defaultValue="12" inputMode="numeric" />
            </InputGroup>
          </Cell>
          <Cell label="下拉选择">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="inbox">待安排</option>
              <option value="scheduled">已排期</option>
              <option value="completed">已完成</option>
            </Select>
          </Cell>
          <Cell label="多行 + 前缀图标">
            <InputGroup multiline prefix={<FileText size={15} />}>
              <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注" />
            </InputGroup>
          </Cell>
          <Cell label="无效态">
            <Input defaultValue="abc" aria-invalid />
          </Cell>
        </div>
      </Section>

      <Section id="number" title="NumberField" note="步进按钮支持长按连续调整，越界自动钳制；输入过程不打断，失焦时才收敛。">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Field label="每日数量" description={`每天会生成 ${quota === '' ? 1 : quota} 个任务块。`}>
            <NumberField value={quota} onChange={setQuota} min={1} max={10} size="lg" />
          </Field>
          <Field label="每周目标" labelVariant="row">
            <NumberField value={hours} onChange={setHours} min={1} max={80} controls={false} suffix="小时" />
          </Field>
          <Field label="带步进 + 单位" description="范围 5–180 分钟">
            <NumberField value={minutes} onChange={setMinutes} min={5} max={180} step={5} suffix="分钟" />
          </Field>
        </div>
      </Section>

      <Section id="settings" title="设置行（真实布局复刻）" note="整行可点，Switch 是原生 checkbox + role=switch，键盘与读屏行为不变。">
        <div className="max-w-[440px] space-y-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <Field label={<><Target size={16} />每周目标</>} labelVariant="row" tone="card">
              <NumberField value={hours} onChange={setHours} min={1} max={80} controls={false} suffix="小时" />
            </Field>
          </div>
          <Field orientation="horizontal" labelVariant="row" label={<><Volume2 size={16} />提示音</>} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <Switch checked={sound} onChange={(event) => setSound(event.target.checked)} />
          </Field>
          <Field orientation="horizontal" labelVariant="row" label={<><Bell size={16} />系统通知</>} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <Switch checked={notify} onChange={(event) => setNotify(event.target.checked)} />
          </Field>
          <Field
            orientation="horizontal"
            labelVariant="row"
            label={<><Minimize2 size={16} />最小化到托盘</>}
            description="关闭窗口时保留后台计时"
            className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
          >
            <Switch checked={tray} onChange={(event) => setTray(event.target.checked)} />
          </Field>
          <FieldSet className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <FieldLegend variant="row"><Coffee size={16} />休息时长</FieldLegend>
            <div className="grid grid-cols-4 gap-2">
              {[3, 5, 10, 15].map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={minutes === 5}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${minutes === 5 ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100'}`}
                >
                  {minutes} 分钟
                </button>
              ))}
            </div>
          </FieldSet>
        </div>
      </Section>

      <Section id="chips" title="星期选择（CheckboxChip）" note="整块 chip 可点，文本对读屏隐藏，勾选框带本地化 aria-label。">
        <div className="max-w-[440px]">
          <FieldSet>
            <FieldLegend>重复日</FieldLegend>
            <div className="grid grid-cols-7 gap-1">
              {['一', '二', '三', '四', '五', '六', '日'].map((label, day) => (
                <CheckboxChip
                  key={label}
                  label={label}
                  ariaLabel={`星期${label}`}
                  checked={days.includes(day)}
                  onChange={(checked) => setDays((current) => checked
                    ? [...current, day].sort()
                    : current.filter((item) => item !== day))}
                />
              ))}
            </div>
            <p className="text-xs text-gray-500">已选：{[...days].sort().map((day) => ['一', '二', '三', '四', '五', '六', '日'][day]).join(' · ') || '无'}</p>
          </FieldSet>
          <div className="mt-4 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <Checkbox defaultChecked /> 独立勾选框
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <Checkbox disabled /> 禁用
            </label>
          </div>
        </div>
      </Section>

      <Section id="manual" title="真实布局复刻：手动任务弹窗" note="图标、单位、多行文本在同一垂直节奏里对齐。">
        <div className="max-w-[420px] rounded-2xl border border-gray-100 bg-white p-6 shadow-xl">
          <div className="space-y-5">
            <Field label="任务名称" required>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="目标">
              <InputGroup prefix={<Target size={15} />}>
                <Input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="选择或输入目标" />
              </InputGroup>
            </Field>
            <Field label="备注">
              <InputGroup multiline prefix={<FileText size={15} />}>
                <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="补充说明" />
              </InputGroup>
            </Field>
          </div>
        </div>
      </Section>

      <Section id="search" title="真实布局复刻：搜索筛选（.motion-ui 作用域）" note="同一套控件在规划器配色下自动换 token —— 这是 A2 的局部验证。">
        <div className="motion-ui rounded-3xl bg-white p-6 shadow-[0_24px_80px_#19191926]">
          <div className="motion-search-form" style={{ padding: 0, borderBottom: 'none', maxHeight: 'none' }}>
            <Input
              type="search"
              className="motion-search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索任务名称、备注、复盘"
              aria-label="搜索任务"
            />
            <Field label="开始日期">
              <Input type="date" defaultValue="2026-10-01" />
            </Field>
            <Field label="结束日期">
              <Input type="date" defaultValue="2026-10-28" />
            </Field>
            <Field label="优先级">
              <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
                <option value="">全部</option>
                <option>P1</option>
                <option>P2</option>
                <option>P3</option>
              </Select>
            </Field>
            <Field label="状态">
              <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">全部</option>
                <option value="inbox">待安排</option>
                <option value="scheduled">已排期</option>
              </Select>
            </Field>
            <button type="submit" className="motion-button motion-primary" onClick={(event) => event.preventDefault()}>
              <Search size={16} /> 搜索
            </button>
          </div>
        </div>
      </Section>

      <Section id="keyboard" title="键盘可达性" note="Tab 进入每个控件；全局 :focus-visible 描边保留，未用 outline:none 抹掉焦点。">
        <FieldGroup className="max-w-[440px]">
          <Field label="第一个" description="Tab 依次穿过 label → 控件 → 下一个字段">
            <Input placeholder="Tab 从这里开始" />
          </Field>
          <Field label="第二个">
            <NumberField value={3} onChange={() => undefined} min={1} max={10} />
          </Field>
        </FieldGroup>
      </Section>
    </main>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>,
);
