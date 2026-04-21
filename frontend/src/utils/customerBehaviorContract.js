export const CUSTOMER_BEHAVIOR = {
  NEW_CUSTOMER: 'NEW_CUSTOMER',
  NOT_BUYING: 'NOT_BUYING',
  BUYING_LESS: 'BUYING_LESS',
  BIG_DROP: 'BIG_DROP',
  BUYING_MORE: 'BUYING_MORE',
  NORMAL: 'NORMAL',
  MIXED: 'MIXED',
};

export const CUSTOMER_BEHAVIOR_META = {
  [CUSTOMER_BEHAVIOR.NEW_CUSTOMER]: {
    label: 'New Customer',
    description: 'First month buying pattern detected',
    badgeClass: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
    theme: {
      bg: 'bg-gradient-to-br from-pink-50/90 via-white to-rose-50/50 dark:from-pink-500/20 dark:via-slate-900 dark:to-rose-500/5',
      border: 'border-pink-200/60 dark:border-pink-500/20',
      text: 'text-pink-600 dark:text-pink-400',
      accent: 'from-pink-500 to-rose-500',
      panelHover: 'group-hover:border-pink-200 dark:group-hover:border-pink-500/30',
      action: 'from-pink-500 to-rose-500',
    },
  },
  [CUSTOMER_BEHAVIOR.NOT_BUYING]: {
    label: 'Stopped Purchasing',
    description: 'No purchase in current cycle',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    theme: {
      bg: 'bg-gradient-to-br from-red-50/90 via-white to-red-50/60 dark:from-red-500/20 dark:via-slate-900 dark:to-red-500/5',
      border: 'border-red-200 dark:border-red-500/30',
      text: 'text-red-600 dark:text-red-400',
      accent: 'from-red-500 to-rose-500',
      panelHover: 'group-hover:border-red-200 dark:group-hover:border-red-500/30',
      action: 'from-red-500 to-rose-500',
    },
  },
  [CUSTOMER_BEHAVIOR.BUYING_LESS]: {
    label: 'Reduced Buying Pattern',
    description: 'Customer is buying less than previous cycle',
    badgeClass: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300',
    theme: {
      bg: 'bg-gradient-to-br from-yellow-50/90 via-white to-amber-50/50 dark:from-yellow-500/20 dark:via-slate-900 dark:to-amber-500/5',
      border: 'border-yellow-200/60 dark:border-yellow-500/20',
      text: 'text-yellow-700 dark:text-yellow-300',
      accent: 'from-yellow-500 to-amber-500',
      panelHover: 'group-hover:border-yellow-200 dark:group-hover:border-yellow-500/30',
      action: 'from-yellow-500 to-amber-500',
    },
  },
  [CUSTOMER_BEHAVIOR.BIG_DROP]: {
    label: 'Significant Drop',
    description: 'Purchase has dropped sharply',
    badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    theme: {
      bg: 'bg-gradient-to-br from-orange-50/90 via-white to-amber-50/50 dark:from-orange-500/20 dark:via-slate-900 dark:to-amber-500/5',
      border: 'border-orange-200/60 dark:border-orange-500/20',
      text: 'text-orange-600 dark:text-orange-400',
      accent: 'from-orange-500 to-amber-500',
      panelHover: 'group-hover:border-orange-200 dark:group-hover:border-orange-500/30',
      action: 'from-orange-500 to-amber-500',
    },
  },
  [CUSTOMER_BEHAVIOR.BUYING_MORE]: {
    label: 'Buying More',
    description: 'Purchase trend is increasing',
    badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
    theme: {
      bg: 'bg-gradient-to-br from-sky-50/90 via-white to-cyan-50/50 dark:from-sky-500/20 dark:via-slate-900 dark:to-cyan-500/5',
      border: 'border-sky-200/60 dark:border-sky-500/20',
      text: 'text-sky-600 dark:text-sky-400',
      accent: 'from-sky-500 to-cyan-500',
      panelHover: 'group-hover:border-sky-200 dark:group-hover:border-sky-500/30',
      action: 'from-sky-500 to-cyan-500',
    },
  },
  [CUSTOMER_BEHAVIOR.NORMAL]: {
    label: 'Stable Buying Pattern',
    description: 'Purchase level is stable',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    theme: {
      bg: 'bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/40 dark:from-emerald-500/20 dark:via-slate-900 dark:to-teal-500/5',
      border: 'border-emerald-200/60 dark:border-emerald-500/20',
      text: 'text-emerald-600 dark:text-emerald-400',
      accent: 'from-emerald-500 to-teal-500',
      panelHover: 'group-hover:border-emerald-200 dark:group-hover:border-emerald-500/30',
      action: 'from-emerald-500 to-teal-500',
    },
  },
  [CUSTOMER_BEHAVIOR.MIXED]: {
    label: 'Mixed Behavior (Less + Not Buying)',
    description: 'Mixed behavior across products',
    badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
    theme: {
      bg: 'bg-gradient-to-br from-purple-50/90 via-white to-violet-50/50 dark:from-purple-500/20 dark:via-slate-900 dark:to-violet-500/5',
      border: 'border-purple-200/60 dark:border-purple-500/20',
      text: 'text-purple-600 dark:text-purple-400',
      accent: 'from-purple-500 to-violet-500',
      panelHover: 'group-hover:border-purple-200 dark:group-hover:border-purple-500/30',
      action: 'from-purple-500 to-violet-500',
    },
  },
};

export const normalizeBehaviorFromIntensity = (rawLevel = '') => {
  const level = String(rawLevel || '').toUpperCase();
  if (level.includes('MIXED')) return CUSTOMER_BEHAVIOR.MIXED;
  if (level.includes('NOT_PURCHASED') || level.includes('LIYA_HI_NAHI')) return CUSTOMER_BEHAVIOR.NOT_BUYING;
  if (level.includes('MAJOR_DROP') || level.includes('BAHUT_KAM')) return CUSTOMER_BEHAVIOR.BIG_DROP;
  if (level.includes('MINOR_DROP') || level.includes('THODA_KAM') || level.includes('WATCH')) return CUSTOMER_BEHAVIOR.BUYING_LESS;
  if (level.includes('NEW')) return CUSTOMER_BEHAVIOR.NEW_CUSTOMER;
  if (level.includes('GROW')) return CUSTOMER_BEHAVIOR.BUYING_MORE;
  if (level.includes('STABLE') || level.includes('HEALTHY')) return CUSTOMER_BEHAVIOR.NORMAL;
  return CUSTOMER_BEHAVIOR.NORMAL;
};

export const resolveCustomerBehavior = (client = {}, options = {}) => {
  const base = normalizeBehaviorFromIntensity(client?.intensity_level);
  const hasMixed = Boolean(options?.hasMixedBehavior);
  if (hasMixed) return CUSTOMER_BEHAVIOR.MIXED;

  if (base !== CUSTOMER_BEHAVIOR.NORMAL) return base;

  const trend = String(client?.monthly_trend || '').toLowerCase();
  const risk = String(client?.risk || client?.risk_level || '').toUpperCase();
  if (trend === 'down' || risk.includes('CHURN')) return CUSTOMER_BEHAVIOR.BUYING_LESS;
  if (trend === 'up') return CUSTOMER_BEHAVIOR.BUYING_MORE;
  return CUSTOMER_BEHAVIOR.NORMAL;
};

export const getCustomerBehaviorMeta = (behavior) => {
  return CUSTOMER_BEHAVIOR_META[behavior] || CUSTOMER_BEHAVIOR_META[CUSTOMER_BEHAVIOR.NORMAL];
};

export const toWatchCategory = (behavior) => {
  if (behavior === CUSTOMER_BEHAVIOR.NOT_BUYING) return 'STOPPED';
  if (behavior === CUSTOMER_BEHAVIOR.BIG_DROP || behavior === CUSTOMER_BEHAVIOR.BUYING_LESS || behavior === CUSTOMER_BEHAVIOR.MIXED) return 'LESS';
  return 'GOOD';
};
