import React, { useEffect, useState } from 'react';
import { FileText, Plus, Target } from 'lucide-react';
import DurationPicker from './DurationPicker';
import { Button, Dialog, Field, Input, InputGroup, Textarea } from '../ui';
import { useLanguage } from '../contexts/LanguageContext';
import { getGoals } from '../services/storage';

interface ManualTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    durationMinutes: number;
    goalName?: string;
    note?: string;
  }) => void;
}

const ManualTaskModal: React.FC<ManualTaskModalProps> = ({ isOpen, onClose, onCreate }) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [goalName, setGoalName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number | ''>(25);
  const [note, setNote] = useState('');
  const [goalOptions, setGoalOptions] = useState(() => getGoals());

  useEffect(() => {
    if (isOpen) {
      setGoalOptions(getGoals());
    }
  }, [isOpen]);

  const reset = () => {
    setName('');
    setGoalName('');
    setDurationMinutes(25);
    setNote('');
  };

  const closeAndReset = () => {
    reset();
    onClose();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const taskName = name.trim();
    if (!taskName || durationMinutes === '' || !Number.isInteger(durationMinutes)
      || durationMinutes < 1 || durationMinutes > 180) return;

    onCreate({
      name: taskName,
      durationMinutes,
      goalName: goalName.trim() || undefined,
      note: note.trim() || undefined,
    });
    reset();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={closeAndReset}
      size="md"
      title={t('manual_task_title')}
      icon={<Plus size={18} className="text-gray-400" aria-hidden="true" />}
      headerClassName="bg-gray-50/50"
      closeLabel={t('close')}
      initialFocusSelector={'input[type="text"]'}
    >
        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label={t('manual_task_name')} required>
            <Input
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('manual_task_placeholder')}
            />
          </Field>

          <Field label={t('goal_name')}>
            <InputGroup prefix={<Target size={15} />}>
              <Input
                type="text"
                value={goalName}
                onChange={(event) => setGoalName(event.target.value)}
                list="manual-task-goals"
                placeholder={t('goal_placeholder')}
              />
            </InputGroup>
            <datalist id="manual-task-goals">
              {goalOptions.map((goal) => (
                <option key={goal.id} value={goal.name} />
              ))}
            </datalist>
          </Field>

          <Field label={t('manual_task_duration')}>
            <DurationPicker value={durationMinutes} onChange={setDurationMinutes} label={t('manual_task_duration')} />
          </Field>

          <Field label={t('task_note_label')}>
            <InputGroup multiline prefix={<FileText size={15} />}>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder={t('task_note_placeholder')}
              />
            </InputGroup>
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeAndReset}>
              {t('cancel')}
            </Button>
            <Button type="submit">
              {t('manual_task_create')}
            </Button>
          </div>
        </form>
    </Dialog>
  );
};

export default ManualTaskModal;
