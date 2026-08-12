import { SM2State, ReviewRating, CardStatus } from '../../core/algorithm/sm2';

export interface AnkiSM2Config {
  /** Learning steps in minutes (e.g. [1, 10]) */
  learningSteps: number[];
  /** Relearning steps in minutes (e.g. [10]) */
  relearningSteps: number[];
  /** Graduation interval in days when finishing learning steps with 'Good' (default 1) */
  graduatingInterval: number;
  /** Graduation interval in days when pressing 'Easy' on learning card (default 4) */
  easyGraduatingInterval: number;
  /** Minimum Ease Factor floor (default 1.30 = 130%) */
  minEaseFactor: number;
  /** Initial Ease Factor for new cards (default 2.50 = 250%) */
  initialEaseFactor: number;
  /** Easy bonus multiplier applied on 'Easy' reviews (default 1.30 = 130%) */
  easyBonus: number;
  /** Hard interval multiplier applied on 'Hard' reviews (default 1.20 = 120%) */
  hardIntervalMultiplier: number;
  /** Global interval modifier (default 1.00 = 100%) */
  intervalModifier: number;
  /** New interval factor post-lapse / relearning multiplier (default 0.00) */
  newIntervalFactor: number;
  /** Maximum allowed interval in days (default 36500 = 100 years) */
  maxInterval: number;
}

export const DEFAULT_ANKI_SM2_CONFIG: AnkiSM2Config = {
  learningSteps: [1, 10],
  relearningSteps: [10],
  graduatingInterval: 1,
  easyGraduatingInterval: 4,
  minEaseFactor: 1.30,
  initialEaseFactor: 2.50,
  easyBonus: 1.30,
  hardIntervalMultiplier: 1.20,
  intervalModifier: 1.00,
  newIntervalFactor: 0.00,
  maxInterval: 36500,
};

export interface ReviewCalculationResult {
  nextState: SM2State;
  estimatedNextIntervalText: string;
}

export class ReviewSchedulerService {
  private config: AnkiSM2Config;

  constructor(customConfig?: Partial<AnkiSM2Config>) {
    this.config = { ...DEFAULT_ANKI_SM2_CONFIG, ...customConfig };
  }

  public getConfig(): AnkiSM2Config {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<AnkiSM2Config>): AnkiSM2Config {
    this.config = { ...this.config, ...newConfig };
    return this.getConfig();
  }

  /**
   * Generates the initial SM-2 state for a brand-new flashcard.
   */
  public createInitialState(customConfig?: Partial<AnkiSM2Config>): SM2State {
    const cfg = customConfig ? { ...this.config, ...customConfig } : this.config;
    return {
      status: 'new',
      interval: 0,
      easeFactor: cfg.initialEaseFactor,
      repetitions: 0,
      lapses: 0,
      learningStep: 0,
      relearningStep: 0,
      dueDate: new Date().toISOString(),
    };
  }

  /**
   * Main calculation engine for the official Anki SM-2 Spaced Repetition Algorithm.
   * Handles: Ease Factor, Interval, Due Date, Learning Steps, Relearning, Graduating,
   * Easy Bonus, Hard Interval, and Lapses.
   */
  public calculateNextState(
    currentState: SM2State,
    rating: ReviewRating,
    now: Date = new Date(),
    customConfig?: Partial<AnkiSM2Config>
  ): SM2State {
    const cfg = customConfig ? { ...this.config, ...customConfig } : this.config;
    const status: CardStatus = currentState.status || 'new';

    let easeFactor = currentState.easeFactor || cfg.initialEaseFactor;
    let interval = currentState.interval || 0;
    let repetitions = currentState.repetitions || 0;
    let lapses = currentState.lapses || 0;
    let learningStep = currentState.learningStep || 0;
    let relearningStep = currentState.relearningStep || 0;

    const dueDateObj = new Date(now.getTime());
    let nextStatus: CardStatus = status;
    let nextInterval = interval;
    let nextMinutes = 0;

    // Branch logic by card status (new/learning, review, relearning)
    if (status === 'new' || status === 'learning') {
      const steps = cfg.learningSteps.length > 0 ? cfg.learningSteps : [1, 10];

      switch (rating) {
        case 1: // Again
          learningStep = 0;
          nextStatus = 'learning';
          nextInterval = 0;
          nextMinutes = steps[0] || 1;
          break;

        case 2: // Hard
          nextStatus = 'learning';
          nextInterval = 0;
          if (steps.length > 1 && learningStep < steps.length - 1) {
            // Average of current and next learning step
            const currentMin = steps[learningStep];
            const nextMin = steps[learningStep + 1];
            nextMinutes = Math.round((currentMin + nextMin) / 2);
          } else {
            nextMinutes = steps[learningStep] || 1;
          }
          break;

        case 3: // Good
          if (learningStep + 1 < steps.length) {
            // Advance to next learning step
            learningStep += 1;
            nextStatus = 'learning';
            nextInterval = 0;
            nextMinutes = steps[learningStep];
          } else {
            // GRADUATING to Review!
            nextStatus = 'review';
            nextInterval = cfg.graduatingInterval;
            repetitions = 1;
            learningStep = 0;
          }
          break;

        case 4: // Easy
          // Immediate GRADUATING to Review!
          nextStatus = 'review';
          nextInterval = cfg.easyGraduatingInterval;
          repetitions = 1;
          learningStep = 0;
          break;
      }
    } else if (status === 'relearning') {
      const steps = cfg.relearningSteps.length > 0 ? cfg.relearningSteps : [10];

      switch (rating) {
        case 1: // Again
          relearningStep = 0;
          nextStatus = 'relearning';
          nextInterval = 0;
          nextMinutes = steps[0] || 10;
          break;

        case 2: // Hard
          nextStatus = 'relearning';
          nextInterval = 0;
          nextMinutes = steps[relearningStep] || 10;
          break;

        case 3: // Good
          if (relearningStep + 1 < steps.length) {
            relearningStep += 1;
            nextStatus = 'relearning';
            nextInterval = 0;
            nextMinutes = steps[relearningStep];
          } else {
            // RE-GRADUATING back to Review!
            nextStatus = 'review';
            const previousInterval = interval || cfg.graduatingInterval;
            const calculatedInterval = Math.round(previousInterval * cfg.newIntervalFactor);
            nextInterval = Math.max(cfg.graduatingInterval, calculatedInterval);
            repetitions = 1;
            relearningStep = 0;
          }
          break;

        case 4: // Easy
          // Immediate RE-GRADUATING back to Review!
          nextStatus = 'review';
          const previousInterval = interval || cfg.graduatingInterval;
          const calculatedInterval = Math.round(previousInterval * cfg.easyBonus);
          nextInterval = Math.max(cfg.easyGraduatingInterval, calculatedInterval);
          repetitions = 1;
          relearningStep = 0;
          break;
      }
    } else {
      // Status: 'review'
      switch (rating) {
        case 1: // Again -> LAPSE
          lapses += 1;
          // Ease Factor Penalty for lapse (-0.20)
          easeFactor = Math.max(cfg.minEaseFactor, easeFactor - 0.20);
          repetitions = 0;
          nextStatus = 'relearning';
          relearningStep = 0;
          nextInterval = 0;
          const steps = cfg.relearningSteps.length > 0 ? cfg.relearningSteps : [10];
          nextMinutes = steps[0] || 10;
          break;

        case 2: // Hard
          // Ease Factor Penalty (-0.15)
          easeFactor = Math.max(cfg.minEaseFactor, easeFactor - 0.15);
          repetitions += 1;
          nextStatus = 'review';
          const hardFactor = cfg.hardIntervalMultiplier * cfg.intervalModifier;
          const rawHardInterval = Math.max(interval + 1, Math.round(interval * hardFactor));
          nextInterval = Math.min(cfg.maxInterval, rawHardInterval);
          break;

        case 3: // Good
          repetitions += 1;
          nextStatus = 'review';
          const goodFactor = easeFactor * cfg.intervalModifier;
          const rawGoodInterval = Math.max(interval + 1, Math.round(interval * goodFactor));
          nextInterval = Math.min(cfg.maxInterval, rawGoodInterval);
          break;

        case 4: // Easy
          // Ease Factor Boost (+0.15)
          easeFactor = easeFactor + 0.15;
          repetitions += 1;
          nextStatus = 'review';
          const easyFactor = easeFactor * cfg.easyBonus * cfg.intervalModifier;
          const rawEasyInterval = Math.max(interval + 1, Math.round(interval * easyFactor));
          nextInterval = Math.min(cfg.maxInterval, rawEasyInterval);
          break;
      }
    }

    // Set Due Date
    if (nextInterval === 0 && nextMinutes > 0) {
      dueDateObj.setMinutes(dueDateObj.getMinutes() + nextMinutes);
    } else {
      dueDateObj.setDate(dueDateObj.getDate() + nextInterval);
    }

    return {
      status: nextStatus,
      interval: nextInterval,
      easeFactor: Number(easeFactor.toFixed(2)),
      repetitions,
      lapses,
      learningStep,
      relearningStep,
      dueDate: dueDateObj.toISOString(),
      lastReviewedAt: now.toISOString(),
    };
  }

  /**
   * Helper to display user-friendly interval preview labels for review buttons
   * (e.g. "< 1 min", "< 10 min", "1 dia", "6 dias", "2.5 meses").
   */
  public getIntervalPreviewText(
    currentState: SM2State,
    rating: ReviewRating,
    now: Date = new Date(),
    customConfig?: Partial<AnkiSM2Config>
  ): string {
    const nextState = this.calculateNextState(currentState, rating, now, customConfig);

    if (nextState.interval === 0) {
      // Find minutes
      const cfg = customConfig ? { ...this.config, ...customConfig } : this.config;
      let mins = 1;
      if (nextState.status === 'learning') {
        const steps = cfg.learningSteps;
        mins = steps[nextState.learningStep] || 1;
      } else if (nextState.status === 'relearning') {
        const steps = cfg.relearningSteps;
        mins = steps[nextState.relearningStep] || 10;
      }
      return `< ${mins} min`;
    }

    return this.formatIntervalText(nextState.interval);
  }

  /**
   * Formats a day-based interval into a clean human-readable Portuguese string.
   */
  public formatIntervalText(intervalInDays: number): string {
    if (intervalInDays <= 0) return '< 1 min';
    if (intervalInDays === 1) return '1 dia';
    if (intervalInDays < 30) return `${intervalInDays} dias`;
    if (intervalInDays < 365) {
      const months = (intervalInDays / 30).toFixed(1);
      return `${months.replace('.0', '')} meses`;
    }
    const years = (intervalInDays / 365).toFixed(1);
    return `${years.replace('.0', '')} anos`;
  }
}

// Default singleton instance
export const reviewSchedulerService = new ReviewSchedulerService();
