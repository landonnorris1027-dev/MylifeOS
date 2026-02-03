import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'en' | 'zh';

const translations = {
  en: {
    app_title: "MyLifeOS",
    // Progress
    p1_label: "P1 Focus",
    p2_label: "P2 Focus",
    p3_label: "P3 Focus",
    // Header
    config_habits: "Config Habits",
    view_planner: "Planner",
    view_profile: "Profile",
    // Inbox
    inbox: "Inbox",
    all_dispatched: "All dispatched!",
    check_settings: "Check settings to add more.",
    add_routine: "Add new routine",
    // Timeline
    timeline: "Timeline",
    // Config Modal
    config_habit_title: "Config Habit",
    manage_habits_title: "Existing Habits",
    delete_confirm: "Delete this habit rule? Past logs will stay.",
    habit_name: "Habit Name",
    habit_placeholder: "e.g. Deep Work, Read Book",
    priority_class: "Priority Class",
    daily_quota: "Daily Quota",
    quota_desc: "Will generate {n} blocks daily.",
    habit_duration: "Duration (Min)",
    create_rule: "Create Habit Rule",
    p1_btn: "P1 Class",
    p2_btn: "P2 Class",
    p3_btn: "P3 Class",
    // Effective Range
    effective_mode: "Effective Mode",
    mode_permanent: "Permanent",
    mode_range: "Date Range",
    start_date: "Start Date",
    end_date: "End Date",
    // Data Management
    data_management: "Data Management",
    backup_data: "Backup Data (JSON)",
    restore_data: "Restore Data",
    restore_confirm: "This will overwrite current data. Continue?",
    import_success: "Data restored successfully!",
    import_error: "Invalid data file.",
    // Timer
    focus_mode: "Focus Mode",
    break_mode: "Break Time",
    stay_focused: "Stay focused. Do not switch tabs.",
    enjoy_break: "Take a breath. You earned it.",
    mark_early: "Mark Done Early",
    skip_break: "Skip Break",
    complete_session: "Complete Session",
    // Scheduler
    schedule_task: "Schedule Task",
    select_time: "Select a start time for",
    // Task Actions
    delete_today: "Delete for today only",
    delete_permanent_block: "Delete permanently (Reduce quota)",
    confirm_permanent_delete: "This will reduce the daily quota for this habit permanently. Continue?",
    // Profile
    profile_title: "Focus Profile",
    total_focus_hours: "Total Focus Hours",
    last_year_activity: "Activity in the last year",
    less: "Less",
    more: "More",
    hours_suffix: "h",
    // Formats
    date_locale: "en-US",
  },
  zh: {
    app_title: "MyLifeOS",
    // Progress
    p1_label: "A类 核心",
    p2_label: "B类 次要",
    p3_label: "C类 日常",
    // Header
    config_habits: "习惯管理",
    view_planner: "日程规划",
    view_profile: "个人主页",
    // Inbox
    inbox: "待办池",
    all_dispatched: "今日任务已派发完毕",
    check_settings: "去配置添加更多习惯",
    add_routine: "添加新习惯",
    // Timeline
    timeline: "今日日程",
    // Config Modal
    config_habit_title: "配置习惯",
    manage_habits_title: "已存习惯规则",
    delete_confirm: "确定删除此习惯规则吗？（已生成的历史记录会保留）",
    habit_name: "习惯名称",
    habit_placeholder: "例如：专业课、背单词",
    priority_class: "优先级分类",
    daily_quota: "每日目标",
    quota_desc: "每天自动生成 {n} 个待办块",
    habit_duration: "单次时长 (分钟)",
    create_rule: "保存规则",
    p1_btn: "P1 (核心/A类)",
    p2_btn: "P2 (次要/B类)",
    p3_btn: "P3 (日常/C类)",
    // 生效范围
    effective_mode: "生效模式",
    mode_permanent: "永久有效",
    mode_range: "指定日期范围",
    start_date: "开始日期",
    end_date: "结束日期",
    // Data Management
    data_management: "数据管理",
    backup_data: "备份数据 (JSON)",
    restore_data: "恢复数据 (导入)",
    restore_confirm: "这将覆盖当前所有数据，确定吗？",
    import_success: "数据恢复成功！",
    import_error: "数据文件格式错误。",
    // Timer
    focus_mode: "专注模式",
    break_mode: "休息时间",
    stay_focused: "保持专注，不要切出页面",
    enjoy_break: "深呼吸，放松一下。",
    mark_early: "提前完成",
    skip_break: "跳过休息",
    complete_session: "完成",
    // Scheduler
    schedule_task: "安排时间",
    select_time: "为该任务选择开始时间",
    // Task Actions
    delete_today: "仅删除今日",
    delete_permanent_block: "永久删除（减少每日目标）",
    confirm_permanent_delete: "这将永久减少该习惯的每日派发数量。确定吗？",
    // Profile
    profile_title: "专注档案",
    total_focus_hours: "累计专注时长",
    last_year_activity: "过去一年的专注记录",
    less: "少",
    more: "多",
    hours_suffix: "小时",
    // Formats
    date_locale: "zh-CN",
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations['en'], params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('mylifeos_lang');
    return (saved === 'en' || saved === 'zh') ? saved : 'zh';
  });

  useEffect(() => {
    localStorage.setItem('mylifeos_lang', language);
  }, [language]);

  const t = (key: keyof typeof translations['en'], params?: Record<string, string | number>) => {
    let text = translations[language][key] || translations['en'][key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};