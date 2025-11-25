/**
 * KPI Formulas Configuration
 * Centralized definition of all KPI calculation formulas for ActualCalc mode  
 */

export interface KPIFormula {
    id: string;
    title: string;
    formula: React.ReactNode;
}

export const KPI_FORMULAS: Record<string, KPIFormula> = {
    // ===== Alarm Summary Section =====
    total_alarms: {
        id: 'total_alarms',
        title: 'Total Alarms Calculation',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Total = Count of all unique alarm activations</code></p>
                <p className="text-[11px] text-muted-foreground">Sum of all alarm activation events across all sources in the dataset</p>
            </div>
        ),
    },

    total_flood_alarms: {
        id: 'total_flood_alarms',
        title: 'Total Flood Alarms Calculation',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Flood Alarms = Σ(alarms in flood windows)</code></p>
                <p className="text-[11px] text-muted-foreground">Step 1: Identify flood windows (10-min periods with {'\u2265'}2 unhealthy sources)</p>
                <p className="text-[11px] text-muted-foreground">Step 2: Sum all alarms occurring within those windows</p>
            </div>
        ),
    },

    standing_alarms: {
        id: 'standing_alarms',
        title: 'Standing Alarms Calculation',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Standing = Count where (time_active {'>='} stale_min)</code></p>
                <p className="text-[11px] text-muted-foreground">Time active = time from activation until acknowledged or returned to normal</p>
                <p className="text-[11px] text-muted-foreground">ISA 18.2: stale_min = 1440 minutes (24 hours)</p>
            </div>
        ),
    },

    nuisance_repeating: {
        id: 'nuisance_repeating',
        title: 'Nuisance/Repeating Alarms Calculation',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Nuisance = Chattering + IF_Chattering</code></p>
                <p className="text-[11px] text-muted-foreground">Chattering: Alarms repeating within chatter threshold (default 10 min)</p>
                <p className="text-[11px] text-muted-foreground">IF_Chattering: Chattering alarms flagged as instrument failures</p>
            </div>
        ),
    },

    // ===== Frequency Metrics Section =====
    alarm_rate_daily: {
        id: 'alarm_rate_daily',
        title: 'Daily Alarm Rate Calculation',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Daily Rate = total_alarms ÷ total_days</code></p>
                <p className="text-[11px] text-muted-foreground">ISO/EEMUA 191: Average alarm activations per 24-hour period</p>
                <p className="text-[11px] text-muted-foreground">Benchmark: {'\u003c'}288/day = acceptable, {'\u2265'}720/day = critical</p>
            </div>
        ),
    },

    alarm_rate_hourly: {
        id: 'alarm_rate_hourly',
        title: 'Hourly Alarm Rate Calculation',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Hourly Rate = total_alarms ÷ (days × 24)</code></p>
                <p className="text-[11px] text-muted-foreground">ISO/EEMUA 191: Average alarm activations per hour</p>
                <p className="text-[11px] text-muted-foreground">Benchmark: {'\u003c'}12/hour = acceptable, {'\u2265'}30/hour = critical</p>
            </div>
        ),
    },

    alarm_rate_10min: {
        id: 'alarm_rate_10min',
        title: '10-Minute Alarm Rate Calculation',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">10min Rate = total_alarms ÷ (days × 144)</code></p>
                <p className="text-[11px] text-muted-foreground">ISO/EEMUA 191: Average alarms per 10-minute window</p>
                <p className="text-[11px] text-muted-foreground">144 windows per day (24 hours × 6 windows/hour)</p>
            </div>
        ),
    },

    isa_compliance: {
        id: 'isa_compliance',
        title: 'ISA Compliance Calculation',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">ISA Compliance % = ((days {'\u003c'}288) ÷ total_days) × 100</code></p>
                <p className="text-[11px] text-muted-foreground">ISA 18.2 Standard: Days under 288 alarms/day threshold</p>
                <p className="text-[11px] text-muted-foreground">Target: {'\u003e'}90% of days should be compliant</p>
            </div>
        ),
    },

    critical_overload: {
        id: 'critical_overload',
        title: 'Critical Overload Calculation',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Critical % = ((days {'\u2265'}720) ÷ total_days) × 100</code></p>
                <p className="text-[11px] text-muted-foreground">Days with {'\u2265'}720 alarms (critically overloaded)</p>
                <p className="text-[11px] text-muted-foreground">Target: 0% - no days should reach critical overload</p>
            </div>
        ),
    },

    // ===== Detailed Analytics Section =====
    unhealthy_periods: {
        id: 'unhealthy_periods',
        title: 'Unhealthy Periods Calculation',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Unhealthy = Σ(10min windows where alarms {'\u003e'} threshold)</code></p>
                <p className="text-[11px] text-muted-foreground">Step 1: Divide time into 10-minute windows</p>
                <p className="text-[11px] text-muted-foreground">Step 2: Count alarms per source per window</p>
                <p className="text-[11px] text-muted-foreground">Step 3: Sum windows exceeding threshold (typically 10 alarms/10min)</p>
            </div>
        ),
    },

    flood_windows: {
        id: 'flood_windows',
        title: 'Flood Windows Calculation',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Floods = Count(windows with {'\u2265'}2 unhealthy sources)</code></p>
                <p className="text-[11px] text-muted-foreground">Window is "flood" when multiple sources are simultaneously overloaded</p>
                <p className="text-[11px] text-muted-foreground">Indicates system-wide stress vs. single-source issues</p>
            </div>
        ),
    },

    bad_actors: {
        id: 'bad_actors',
        title: 'Bad Actors Calculation',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Bad Actors = Top sources by flood contribution</code></p>
                <p className="text-[11px] text-muted-foreground">Rank sources by: (alarms in floods + flood windows involved)</p>
                <p className="text-[11px] text-muted-foreground">Identifies sources driving system-wide alarm events</p>
            </div>
        ),
    },

    // ===== Tree Structure Nodes =====
    tree_total_alarms: {
        id: 'tree_total_alarms',
        title: 'Total Alarms (Root Node)',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Total = All unique alarm activations</code></p>
                <p className="text-[11px] text-muted-foreground">Root of alarm categorization tree</p>
                <p className="text-[11px] text-muted-foreground">Splits into: Standing + Nuisance/Repeating + Flood + Other</p>
            </div>
        ),
    },

    tree_standing: {
        id: 'tree_standing',
        title: 'Standing Alarms',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Standing = Alarms active {'>='} stale_min (1440 min / 24h)</code></p>
                <p className="text-[11px] text-muted-foreground">Time from activation to ack/RTN exceeds ISA 18.2 threshold</p>
                <p className="text-[11px] text-muted-foreground">Sub-categories: Stale + Instruments Faulty</p>
            </div>
        ),
    },

    tree_nuisance: {
        id: 'tree_nuisance',
        title: 'Nuisance/Repeating Alarms',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Nuisance = Chattering + IF Chattering</code></p>
                <p className="text-[11px] text-muted-foreground">Alarms repeating within chatter_min (10 min) threshold</p>
                <p className="text-[11px] text-muted-foreground">Sub-categories: Chattering (operational) + IF Chattering (faulty)</p>
            </div>
        ),
    },

    tree_instruments_faulty: {
        id: 'tree_instruments_faulty',
        title: 'Instruments Faulty (Standing)',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">IF Standing = Standing alarms flagged as faulty</code></p>
                <p className="text-[11px] text-muted-foreground">Standing alarms identified as instrument failures</p>
                <p className="text-[11px] text-muted-foreground">Subset of Standing alarms category</p>
            </div>
        ),
    },

    tree_stale: {
        id: 'tree_stale',
        title: 'Stale Alarms',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Stale = Standing AND unacknowledged</code></p>
                <p className="text-[11px] text-muted-foreground">Standing alarms that remain unacknowledged</p>
                <p className="text-[11px] text-muted-foreground">Subset of Standing alarms category</p>
            </div>
        ),
    },

    tree_chattering: {
        id: 'tree_chattering',
        title: 'Chattering Alarms',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Chattering = Alarms where Δt {'\u003c'} chatter_min (10 min)</code></p>
                <p className="text-[11px] text-muted-foreground">Δt = time between consecutive activations of same source</p>
                <p className="text-[11px] text-muted-foreground">Operational alarms (not flagged as instrument failures)</p>
            </div>
        ),
    },

    tree_instruments_faulty_chattering: {
        id: 'tree_instruments_faulty_chattering',
        title: 'Instruments Faulty (Chattering)',
        formula: (
            <div className="space-y-1.5">
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">IF Chattering = Chattering AND flagged as faulty</code></p>
                <p className="text-[11px] text-muted-foreground">Chattering alarms identified as instrument failures</p>
                <p className="text-[11px] text-muted-foreground">Subset of Nuisance/Repeating alarms category</p>
            </div>
        ),
    },
};
